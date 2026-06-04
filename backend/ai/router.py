"""
MediTrace — AI Model Router
Primary:  Grok (via Groq API, llama-3.3-70b-versatile) — fast extraction, Q&A
Fallback: Gemini 2.5 Flash (via google.genai) — long summaries, trend analysis, reports
NO Claude. NO OpenAI. If one fails, the other is tried automatically.
"""
import os
import json
import re
import asyncio
import logging

logger = logging.getLogger(__name__)

# Load API keys from pydantic Settings (.env aware)
try:
    from database import get_settings as _get_settings
    _settings = _get_settings()
    _GROQ_API_KEY   = _settings.groq_api_key   or os.getenv("GROQ_API_KEY",   "")
    _GEMINI_API_KEY = _settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
except Exception:
    _GROQ_API_KEY   = os.getenv("GROQ_API_KEY",   "")
    _GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ── Groq client (sync SDK, we run in thread) ──────────────────────────────────
try:
    from groq import Groq
    _groq_client = Groq(api_key=_GROQ_API_KEY) if _GROQ_API_KEY else None
    _groq_ok = bool(_GROQ_API_KEY and _groq_client)
except Exception as _e:
    logger.warning(f"[AI] Groq client init failed: {_e}")
    _groq_client = None
    _groq_ok = False

# ── Gemini client (new google.genai SDK) ──────────────────────────────────────
_gemini_ok = False
_gemini_client = None
try:
    from google import genai as _genai_module
    if _GEMINI_API_KEY:
        _gemini_client = _genai_module.Client(api_key=_GEMINI_API_KEY)
        _gemini_ok = True
    else:
        logger.warning("[AI] GEMINI_API_KEY not set — Gemini disabled")
except ImportError:
    # Fallback to legacy google.generativeai if google.genai not installed
    try:
        import google.generativeai as _legacy_genai
        if _GEMINI_API_KEY:
            _legacy_genai.configure(api_key=_GEMINI_API_KEY)
            _gemini_ok = True
            _gemini_client = "legacy"  # sentinel
        else:
            logger.warning("[AI] GEMINI_API_KEY not set — Gemini disabled")
    except Exception as _e:
        logger.warning(f"[AI] Gemini (legacy) init failed: {_e}")
except Exception as _e:
    logger.warning(f"[AI] Gemini init failed: {_e}")


# ── Task → model assignment ───────────────────────────────────────────────────
# Grok  = fast, great at extraction, Q&A, short tasks
# Gemini = best for long summaries, trend analysis, reports
TASK_MODEL = {
    "fast_qa":    "grok",    # quick answers, entity extraction
    "summarize":  "gemini",  # long clinical summaries
    "temporal":   "gemini",  # trend analysis over time
    "autonomous": "grok",    # lab value checking, alerts
    "extract":    "grok",    # pull values from text
    "download":   "gemini",  # generate full report text
}


async def call_ai(task: str, prompt: str, system: str = "") -> dict:
    """
    Route task to primary model; fall back to the other if it fails.
    Returns: {"text": str, "model": str, "ok": bool}
    """
    model = TASK_MODEL.get(task, "grok")

    # Try primary model
    result = (
        await _call_grok(prompt, system)
        if model == "grok"
        else await _call_gemini(prompt, system)
    )

    if result:
        return result

    # Primary failed — try the other one
    logger.warning(f"[AI] {model} failed for task '{task}', trying fallback")
    fallback = (
        await _call_gemini(prompt, system)
        if model == "grok"
        else await _call_grok(prompt, system)
    )

    if fallback:
        return fallback

    # Both failed
    return {
        "text": "AI temporarily unavailable. Please try again.",
        "model": "error",
        "ok": False,
    }


async def _call_grok(prompt: str, system: str) -> dict | None:
    """Call Groq (llama-3.3-70b-versatile) in a thread to avoid blocking."""
    if not _groq_ok or not _groq_client:
        return None
    try:
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})

        def _sync_call():
            return _groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=msgs,
                temperature=0.2,
                max_tokens=1500,
            )

        r = await asyncio.get_event_loop().run_in_executor(None, _sync_call)
        return {
            "text": r.choices[0].message.content,
            "model": "Grok / Llama-3.3",
            "ok": True,
        }
    except Exception as e:
        logger.error(f"[Grok error] {e}")
        return None


async def _call_gemini(prompt: str, system: str) -> dict | None:
    """Call Gemini 2.5 Flash — uses google.genai (new SDK) or legacy fallback."""
    if not _gemini_ok:
        return None
    try:
        if _gemini_client == "legacy":
            return await _call_gemini_legacy(prompt, system)
        return await _call_gemini_new(prompt, system)
    except Exception as e:
        logger.error(f"[Gemini error] {e}")
        return None


async def _call_gemini_new(prompt: str, system: str) -> dict | None:
    """Use new google.genai SDK."""
    from google import genai as _genai_module
    from google.genai import types as _genai_types

    config = {}
    if system:
        config["system_instruction"] = system

    def _sync_call(model_name: str):
        return _gemini_client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=_genai_types.GenerateContentConfig(**config) if config else None,
        )

    # Try gemini-2.5-flash-preview first
    try:
        r = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _sync_call("gemini-2.5-flash-preview-05-20")
        )
        return {"text": r.text, "model": "Gemini 2.5 Flash", "ok": True}
    except Exception as e1:
        logger.warning(f"[Gemini 2.5] failed ({e1}), trying gemini-1.5-flash")
        try:
            r = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _sync_call("gemini-1.5-flash")
            )
            return {"text": r.text, "model": "Gemini 1.5 Flash", "ok": True}
        except Exception as e2:
            logger.error(f"[Gemini 1.5 fallback error] {e2}")
            return None


async def _call_gemini_legacy(prompt: str, system: str) -> dict | None:
    """Use legacy google.generativeai SDK as fallback."""
    import google.generativeai as genai

    cfg = {}
    if system:
        cfg["system_instruction"] = system

    def _sync_call(model_name: str):
        m = genai.GenerativeModel(model_name, **cfg)
        return m.generate_content(prompt)

    # Try gemini-2.5-flash-preview first
    try:
        r = await asyncio.get_event_loop().run_in_executor(
            None, lambda: _sync_call("gemini-2.5-flash-preview-05-20")
        )
        return {"text": r.text, "model": "Gemini 2.5 Flash", "ok": True}
    except Exception as e1:
        logger.warning(f"[Gemini 2.5 legacy] failed ({e1}), trying gemini-1.5-flash")
        try:
            r = await asyncio.get_event_loop().run_in_executor(
                None, lambda: _sync_call("gemini-1.5-flash")
            )
            return {"text": r.text, "model": "Gemini 1.5 Flash", "ok": True}
        except Exception as e2:
            logger.error(f"[Gemini fallback error] {e2}")
            return None


def parse_json_safe(text: str) -> list:
    """Extract a JSON array from AI response safely."""
    if not text:
        return []
    try:
        return json.loads(text)
    except Exception:
        pass
    # Find JSON array in text
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return []


# ── HOW TO USE IN ANY ENDPOINT ────────────────────────────────────────────────
# from ai.router import call_ai
# result = await call_ai("fast_qa", user_prompt, system_prompt)
# result["text"]  → AI answer
# result["model"] → "Grok / Llama-3.3" or "Gemini 2.5 Flash"
# result["ok"]    → True/False
#
# Always show result["model"] as a small badge in the UI.
