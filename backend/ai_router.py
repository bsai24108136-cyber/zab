"""
MediTrace — AI Model Router (top-level)
Doctor AI → Groq (llama-3.3-70b-versatile) — replaces GPT-4o-mini
Patient AI → Gemini (via google.genai) — kept for streaming chat
All feature AI (summary, temporal, autonomous) → ai.router.call_ai()
"""
import logging
import os
from database import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
#  SYSTEM PROMPTS
# ─────────────────────────────────────────────
PATIENT_SYSTEM_PROMPT = """You are MediTrace Health Assistant — a friendly AI for patients at Pakistani clinics.
You help patients understand their own medical records only.

Rules:
- Use simple Urdu-friendly English. Avoid Latin medical jargon.
- Never diagnose. Always say 'your doctor will confirm this.'
- When citing a record say exactly: 'According to your [document name] uploaded on [date]...'
- For any medication question warn: 'Always confirm with your doctor before changing your dose.'
- If symptoms sound like emergency (chest pain, breathlessness, severe bleeding, unconsciousness)
  always say: 'This sounds serious — please go to emergency immediately or call 1122.'
- Never answer questions about any other patient's records.
- Keep responses under 150 words unless the patient asks for detail.
- If no document is found, say: 'I couldn't find this in your uploaded records. Please ask your doctor.'
"""

DOCTOR_SYSTEM_PROMPT = """You are MediTrace Clinical AI — an evidence-based decision-support assistant for doctors.
You are NOT a replacement for clinical judgment. You provide structured suggestions only.

Rules:
- Always cite the exact source: 'Source: [filename], chunk [N], uploaded [date]'
- State confidence as a range: '70–85% probability based on available data'
- If patient history is thin (<3 visits), flag: 'Limited history — interpret with caution.'
- Use clinical terminology appropriate for a licensed doctor.
- Never suggest stopping existing medication without flagging it for clinical review.
- End every response with: 'Clinical AI output — final decision rests with the clinician.'
- If no supporting document: 'No supporting document found. This response is based on general clinical knowledge only.'
"""

# ─────────────────────────────────────────────
#  PAKISTANI DRUG ALIAS DICTIONARY
# ─────────────────────────────────────────────
DRUG_ALIASES: dict[str, str] = {
    "panadol": "Paracetamol", "pcm": "Paracetamol",
    "brufen": "Ibuprofen", "brugesic": "Ibuprofen", "brufen retard": "Ibuprofen SR",
    "ponstan": "Mefenamic Acid",
    "flagyl": "Metronidazole",
    "augmentin": "Amoxicillin/Clavulanate",
    "amoxil": "Amoxicillin",
    "risek": "Omeprazole", "nexium": "Esomeprazole",
    "loprin": "Aspirin", "disprin": "Aspirin",
    "folic": "Folic Acid",
    "voltral": "Diclofenac", "cataflam": "Diclofenac Potassium",
    "calpol": "Paracetamol",
    "maxflu": "Chlorpheniramine",
    "clarinase": "Loratadine/Pseudoephedrine",
    "zyrtec": "Cetirizine",
    "ventolin": "Salbutamol",
    "lasix": "Furosemide",
    "aldactone": "Spironolactone",
    "tenormin": "Atenolol",
    "concor": "Bisoprolol",
    "norvasc": "Amlodipine",
    "coveram": "Perindopril/Amlodipine",
    "glucophage": "Metformin",
    "diamicron": "Gliclazide",
    "insulin": "Insulin",
    "zocor": "Simvastatin",
    "lipitor": "Atorvastatin",
    "ciproxin": "Ciprofloxacin",
    "septra": "Trimethoprim/Sulfamethoxazole",
    "dexona": "Dexamethasone",
    "medrol": "Methylprednisolone",
}


def normalize_drug_name_local(drug_name: str) -> str | None:
    """Look up local drug alias dict. Returns generic name or None if not found."""
    key = drug_name.strip().lower()
    return DRUG_ALIASES.get(key)


# ─────────────────────────────────────────────
#  MODEL ROUTER
# ─────────────────────────────────────────────
def get_model_for_role(role: str) -> str:
    if role == "patient":
        return "gemini-1.5-flash"
    return "llama-3.3-70b-versatile"   # Groq for doctors/admin


# ─────────────────────────────────────────────
#  GEMINI CLIENT (Patient AI — streaming chat)
# ─────────────────────────────────────────────
def _gemini_api_key_ok() -> bool:
    key = settings.gemini_api_key or ""
    return bool(key) and not key.startswith("your_")


def get_gemini_client():
    """
    Initialize and return Gemini generative model.
    Uses the new google.genai package.
    Raises RuntimeError with a clear message if key is missing.
    """
    if not _gemini_api_key_ok():
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. "
            "Add your key to backend/.env and restart the server."
        )
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        return genai.GenerativeModel(
            model_name="gemini-2.5-flash-preview-05-20",
            system_instruction=PATIENT_SYSTEM_PROMPT,
        )
    except Exception as e:
        logger.error(f"[Gemini] Failed to create client: {e}")
        raise RuntimeError(f"Gemini client error: {e}")


# ─────────────────────────────────────────────
#  GROQ CLIENT (Doctor AI — replaces OpenAI)
# ─────────────────────────────────────────────
def _groq_api_key_ok() -> bool:
    key = settings.groq_api_key or ""
    return bool(key) and not key.startswith("your_") and not key.startswith("gsk_your")


def get_groq_client():
    """
    Initialize and return Groq sync client.
    Raises RuntimeError with a clear message if key is missing.
    """
    if not _groq_api_key_ok():
        raise RuntimeError(
            "GROQ_API_KEY is not configured. "
            "Add your key to backend/.env and restart the server. "
            "Get a free key at https://console.groq.com/keys"
        )
    from groq import Groq
    return Groq(api_key=settings.groq_api_key)


# Keep backward-compat alias so any code that calls get_openai_client() still works
def get_openai_client():
    """Deprecated alias — now returns Groq client wrapped in an async-compatible shim."""
    return _GroqAsyncShim(get_groq_client())


class _GroqAsyncShim:
    """
    Thin async wrapper around the sync Groq client so doctor_ai.py can keep
    its `await client.chat.completions.create(...)` call pattern.
    """
    def __init__(self, groq_client):
        self._client = groq_client
        self.chat = _ChatShim(groq_client)


class _ChatShim:
    def __init__(self, groq_client):
        self._client = groq_client
        self.completions = _CompletionsShim(groq_client)


class _CompletionsShim:
    def __init__(self, groq_client):
        self._client = groq_client

    async def create(self, model: str, messages: list, **kwargs) -> object:
        import asyncio
        # Map GPT model names → Groq equivalents
        model = _map_model(model)
        # Strip unsupported kwargs
        kwargs.pop("response_format", None)

        def _sync():
            return self._client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs,
            )

        return await asyncio.get_event_loop().run_in_executor(None, _sync)


def _map_model(model: str) -> str:
    """Map OpenAI model names to Groq equivalents."""
    mapping = {
        "gpt-4o-mini": "llama-3.3-70b-versatile",
        "gpt-4o": "llama-3.3-70b-versatile",
        "gpt-4": "llama-3.3-70b-versatile",
        "gpt-3.5-turbo": "llama-3.1-8b-instant",
    }
    return mapping.get(model, model)


# ─────────────────────────────────────────────
#  AI STATUS — for health check / frontend banner
# ─────────────────────────────────────────────
def get_ai_status() -> dict:
    """Return which AI backends are currently configured."""
    return {
        "gemini_configured": _gemini_api_key_ok(),
        "groq_configured": _groq_api_key_ok(),
        "openai_configured": _groq_api_key_ok(),   # alias for frontend compat
        "patient_ai": "gemini-2.5-flash" if _gemini_api_key_ok() else "not_configured",
        "doctor_ai": "Groq / Llama-3.3" if _groq_api_key_ok() else "not_configured",
    }


# ─────────────────────────────────────────────
#  COST CALCULATION  (Groq is free-tier)
# ─────────────────────────────────────────────
GROQ_COST_PER_1K = 0.0
GEMINI_FLASH_COST_PER_1K = 0.0


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    # Both Groq and Gemini are free-tier
    return 0.0
