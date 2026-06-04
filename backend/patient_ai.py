"""
MediTrace — Patient AI Router (Gemini 1.5 Flash)
All patient-facing AI: streaming chat, triage, reminders, agent
Covers: Patient AI + part of the 3-mark Agentic AI section
"""
import json, uuid, time, logging
from fastapi.responses import Response
from datetime import datetime, timedelta, date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import get_current_user, require_role
from database import get_db
from models import (
    User, Document, Prescription,
    PatientChatSession, PatientChatMessage,
)
from ai_router import get_gemini_client, PATIENT_SYSTEM_PROMPT
from search import _load_user_embeddings
from embeddings import embed_query, batch_cosine_similarity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai/patient", tags=["Patient AI (Gemini)"])

# ─────────────────────────────────────────────
#  SCHEMAS
# ─────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str | None = None

class TriageRequest(BaseModel):
    symptom_text: str = Field(..., min_length=5, max_length=2000)

class PatientAgentRequest(BaseModel):
    query: str
    patient_id: str | None = None

# ─────────────────────────────────────────────
#  TOOL IMPLEMENTATIONS
# ─────────────────────────────────────────────
async def tool_search_my_documents(query: str, patient_id: str, db: AsyncSession) -> str:
    """Semantic search restricted to this patient's own documents."""
    class FakeUser:
        id = patient_id
        role = "patient"

    items = await _load_user_embeddings(FakeUser(), db)
    if not items:
        return "No documents found for this patient."

    q_vec = embed_query(query)
    scores = batch_cosine_similarity(q_vec, [i["vector"] for i in items])
    ranked = sorted(zip(scores, items), key=lambda x: x[0], reverse=True)[:3]

    results = []
    for score, item in ranked:
        if score > 0.1:
            upload_date = (
                item["upload_date"].strftime("%d %b %Y")
                if item["upload_date"] else "unknown date"
            )
            results.append(
                f"From: {item['filename']} (uploaded {upload_date}), "
                f"Chunk {item['chunk_index'] + 1}: {item['chunk_text'][:300]}…"
            )
    return "\n\n".join(results) if results else "No relevant content found in your documents."


async def tool_get_my_medications(patient_id: str, db: AsyncSession) -> str:
    """Return patient's active prescriptions."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.patient_id == patient_id,
            Prescription.status == "active",
        )
    )
    rxs = result.scalars().all()
    if not rxs:
        return "No active prescriptions found."
    lines = []
    for rx in rxs:
        end_date = None
        if rx.start_date and rx.duration_days:
            end_date = rx.start_date + timedelta(days=rx.duration_days)
        lines.append(
            f"- {rx.medicine_normalized or rx.medicine_name} {rx.dosage or ''}, "
            f"{rx.frequency or ''} (#{rx.rx_number})"
            + (f", refill by {end_date.strftime('%d %b %Y')}" if end_date else "")
        )
    return "Active medications:\n" + "\n".join(lines)


async def tool_triage_symptoms(symptom_text: str, model) -> dict:
    """Run symptom triage via Gemini, return structured JSON."""
    triage_prompt = (
        f'Analyze these symptoms and return ONLY valid JSON (no markdown):\n'
        f'Symptoms: "{symptom_text}"\n\n'
        'Return exactly this structure:\n'
        '{"urgency":"low|moderate|high|emergency",'
        '"suggested_action":"rest at home|see doctor in 2-3 days|see doctor today|go to ER now",'
        '"possible_concerns":["..."],'
        '"disclaimer":"This is not a medical diagnosis. Please consult your doctor."}\n\n'
        'Emergency: chest pain, breathlessness, severe bleeding, unconsciousness.'
    )
    response = model.generate_content(triage_prompt)
    try:
        text = response.text.strip()
        # Strip markdown code fences if present
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception:
        return {
            "urgency": "moderate",
            "suggested_action": "see doctor in 2-3 days",
            "possible_concerns": ["Unable to parse symptoms automatically"],
            "disclaimer": "This is not a medical diagnosis. Please consult your doctor.",
        }


async def tool_get_upcoming_reminders(patient_id: str, db: AsyncSession) -> str:
    """Return meds with refill due in next 7 days."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.patient_id == patient_id,
            Prescription.status == "active",
        )
    )
    rxs = result.scalars().all()
    today = date.today()
    soon = today + timedelta(days=7)
    reminders = []
    for rx in rxs:
        if rx.start_date and rx.duration_days:
            end_date = rx.start_date + timedelta(days=rx.duration_days)
            if today <= end_date <= soon:
                reminders.append(
                    f"⚠️ {rx.medicine_normalized or rx.medicine_name} — refill needed by "
                    f"{end_date.strftime('%d %b %Y')}"
                )
    return "\n".join(reminders) if reminders else "No medication reminders in the next 7 days."

# ─────────────────────────────────────────────
#  AGENT — MANUAL TOOL LOOP FOR GEMINI
# ─────────────────────────────────────────────
AGENT_INSTRUCTIONS = """
You have access to these tools. When you need one, output EXACTLY this JSON on its own line (no other text on that line):
{"tool": "search_my_documents", "args": {"query": "..."}}
{"tool": "get_my_medications", "args": {}}
{"tool": "triage_symptoms", "args": {"symptoms": "..."}}
{"tool": "get_upcoming_reminders", "args": {}}

After receiving tool results, compose your final answer.
Always cite the document name and upload date. Keep answers under 150 words.
"""

@router.post("/agent")
async def patient_agent(
    body: PatientAgentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("patient")),
):
    """Patient Agent — Gemini 1.5 Flash with manual tool loop."""
    try:
        model = get_gemini_client()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    patient_id = current_user.id
    tools_called: list[str] = []
    steps = [{"step": 1, "label": "Analyzing your question…"}]
    tool_results: dict = {}

    # Step 1 — ask Gemini which tool to call
    first_prompt = (
        PATIENT_SYSTEM_PROMPT + "\n\n" + AGENT_INSTRUCTIONS +
        f"\n\nPatient question: {body.query}\n\n"
        "Decide which tool(s) you need, output the JSON call(s), then stop."
    )
    resp1 = model.generate_content(first_prompt)
    raw1 = resp1.text or ""

    # Parse tool calls
    for line in raw1.splitlines():
        line = line.strip()
        if not line.startswith('{"tool":'):
            continue
        try:
            call = json.loads(line)
            tool_name = call.get("tool", "")
            args = call.get("args", {})
            tools_called.append(tool_name)

            if tool_name == "search_my_documents":
                steps.append({"step": len(steps)+1, "label": "Searching your records…"})
                tool_results["search_results"] = await tool_search_my_documents(
                    args.get("query", body.query), patient_id, db
                )
            elif tool_name == "get_my_medications":
                steps.append({"step": len(steps)+1, "label": "Checking your medications…"})
                tool_results["medications"] = await tool_get_my_medications(patient_id, db)
            elif tool_name == "triage_symptoms":
                steps.append({"step": len(steps)+1, "label": "Analyzing symptoms…"})
                tool_results["triage"] = await tool_triage_symptoms(
                    args.get("symptoms", body.query), model
                )
            elif tool_name == "get_upcoming_reminders":
                steps.append({"step": len(steps)+1, "label": "Checking reminders…"})
                tool_results["reminders"] = await tool_get_upcoming_reminders(patient_id, db)
        except json.JSONDecodeError:
            continue

    # Step 2 — send tool results back to Gemini for final answer
    steps.append({"step": len(steps)+1, "label": "Generating your answer…"})

    if tool_results:
        ctx = "\n\n".join(
            f"[{k.upper()}]\n{json.dumps(v) if isinstance(v, dict) else v}"
            for k, v in tool_results.items()
        )
        final_prompt = (
            PATIENT_SYSTEM_PROMPT + "\n\n" + AGENT_INSTRUCTIONS +
            f"\n\nPatient question: {body.query}\n\n"
            f"Tool results:\n{ctx}\n\n"
            "Write your final answer using the above data. Cite document names and dates."
        )
        resp2 = model.generate_content(final_prompt)
        final_answer = resp2.text or raw1
    else:
        # No tool needed — Gemini answered directly
        final_answer = raw1

    return {
        "answer": final_answer,
        "tools_called": tools_called,
        "steps": steps,
        "triage": tool_results.get("triage"),
        "model": "Gemini 2.5 Flash",
        "disclaimer": "This is not a medical diagnosis. Always consult your doctor.",
    }

# ─────────────────────────────────────────────
#  STREAMING CHAT (SSE)
# ─────────────────────────────────────────────
@router.post("/chat")
async def patient_chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("patient")),
):
    """Streaming patient chat via Gemini 1.5 Flash (SSE)."""
    try:
        model = get_gemini_client()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    patient_id = current_user.id
    session_id = body.session_id or str(uuid.uuid4())

    if not body.session_id:
        session = PatientChatSession(id=session_id, patient_id=patient_id)
        db.add(session)
        await db.commit()

    user_msg = PatientChatMessage(
        id=str(uuid.uuid4()), session_id=session_id,
        role="user", content=body.message,
    )
    db.add(user_msg)
    await db.commit()

    async def generate():
        full_response = ""
        try:
            yield f"data: {json.dumps({'type':'start','session_id':session_id})}\n\n"

            # Quick context from semantic search
            items = await _load_user_embeddings(current_user, db)
            context = ""
            if items:
                q_vec = embed_query(body.message)
                scores = batch_cosine_similarity(q_vec, [i["vector"] for i in items])
                ranked = sorted(zip(scores, items), key=lambda x: x[0], reverse=True)[:2]
                parts = []
                for score, item in ranked:
                    if score > 0.15:
                        d = item["upload_date"].strftime("%d %b %Y") if item["upload_date"] else "unknown"
                        parts.append(f"[From {item['filename']}, uploaded {d}]: {item['chunk_text'][:400]}")
                context = "\n\n".join(parts)

            prompt = PATIENT_SYSTEM_PROMPT
            if context:
                prompt += f"\n\nRelevant records:\n{context}"
            prompt += f"\n\nPatient: {body.message}"

            resp = model.generate_content(prompt, stream=True)
            for chunk in resp:
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {json.dumps({'type':'chunk','text':chunk.text})}\n\n"

            # Save assistant reply
            asst_msg = PatientChatMessage(
                id=str(uuid.uuid4()), session_id=session_id,
                role="assistant", content=full_response,
            )
            db.add(asst_msg)
            await db.commit()
            yield f"data: {json.dumps({'type':'done','session_id':session_id,'model':'gemini-2.5-flash'})}\n\n"

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ─────────────────────────────────────────────
#  TRIAGE
# ─────────────────────────────────────────────
@router.post("/triage")
async def triage_symptoms_endpoint(
    body: TriageRequest,
    current_user: User = Depends(require_role("patient")),
):
    try:
        model = get_gemini_client()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return await tool_triage_symptoms(body.symptom_text, model)

# ─────────────────────────────────────────────
#  REMINDERS
# ─────────────────────────────────────────────
@router.get("/reminders")
async def get_reminders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("patient")),
):
    text = await tool_get_upcoming_reminders(current_user.id, db)
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    return {"reminders": lines, "count": len(lines)}


# ─────────────────────────────────────────────
#  HEALTH AGENT — personalised plan endpoints
# ─────────────────────────────────────────────
from ai.health_agent import generate_health_plans, build_health_plan_pdf


@router.get("/health-plans")
async def get_health_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("patient")),
):
    """
    Return 4 personalised plans (diet, exercise, sleep, lifestyle)
    generated by Gemini 2.5 Flash from the patient's live DB data.
    """
    return await generate_health_plans(current_user.id, db)


@router.post("/health-plans/refresh")
async def refresh_health_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("patient")),
):
    """Force-regenerate plans — identical logic, no cache."""
    return await generate_health_plans(current_user.id, db)


@router.get("/health-plans/download")
async def download_health_plan(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("patient")),
):
    """
    Generate plans and return them as a downloadable PDF (A4, reportlab).
    """
    data = await generate_health_plans(current_user.id, db)

    if data.get("plans", {}).get("error"):
        from fastapi import HTTPException
        raise HTTPException(500, detail=data["plans"]["error"])

    pdf_bytes = build_health_plan_pdf(data, data["patient_name"])

    safe_name = (data["patient_name"] or "Patient").replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="HealthPlan_{safe_name}.pdf"'
        },
    )
