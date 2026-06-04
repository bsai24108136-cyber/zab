"""
MediTrace — Doctor AI Router (Groq / llama-3.3-70b-versatile with function calling)
6 tabs: Q&A, Treatment, Pharmacy, Risk, Lab, Contraindication
Covers: Doctor AI (Groq) + Agentic AI (3 marks) + Citations (1 mark)
"""
import json
import uuid
import time
import logging
from datetime import datetime, timedelta, date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import get_current_user, require_role
from database import get_db
from models import (
    User, Document, Prescription, MedicalRecord, LabReport,
    LabValue, DrugInteraction, DoctorAIQuery, RiskForecast, AdherenceScore
)
from ai_router import (
    get_openai_client, DOCTOR_SYSTEM_PROMPT, calculate_cost,
    normalize_drug_name_local
)
from search import _load_user_embeddings, embed_query, batch_cosine_similarity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai/doctor", tags=["Doctor AI (Groq)"])

# ─────────────────────────────────────────────
#  SCHEMAS
# ─────────────────────────────────────────────
class DoctorQueryRequest(BaseModel):
    patient_id: str
    query: str = Field(..., min_length=1, max_length=2000)

class TreatmentRequest(BaseModel):
    patient_id: str
    presenting_complaint: str

class PharmacyRequest(BaseModel):
    patient_id: str

class RiskRequest(BaseModel):
    patient_id: str
    horizon_days: int = 30

class LabRequest(BaseModel):
    patient_id: str
    lab_report_id: str | None = None

class ContraindicationRequest(BaseModel):
    patient_id: str
    drug_name: str

class AgentRequest(BaseModel):
    query: str
    patient_id: str | None = None

# ─────────────────────────────────────────────
#  HELPER: semantic search for doctor
# ─────────────────────────────────────────────
async def _doc_search(query: str, patient_id: str, doctor: User, db: AsyncSession, top_k: int = 3) -> list[dict]:
    items = await _load_user_embeddings(doctor, db, patient_id)
    if not items:
        return []
    q_vec = embed_query(query)
    scores = batch_cosine_similarity(q_vec, [i["vector"] for i in items])
    ranked = sorted(zip(scores, items), key=lambda x: x[0], reverse=True)[:top_k]
    return [
        {
            "chunk_text": item["chunk_text"],
            "filename": item["filename"],
            "chunk_index": item["chunk_index"],
            "score": round(score * 100, 1),
            "upload_date": item["upload_date"].strftime("%d %b %Y") if item["upload_date"] else "unknown",
        }
        for score, item in ranked if score > 0.1
    ]

async def _get_patient_history(patient_id: str, db: AsyncSession) -> str:
    """Build a text summary of patient history."""
    # Medical records
    recs = (await db.execute(
        select(MedicalRecord).where(MedicalRecord.patient_id == patient_id).order_by(MedicalRecord.visit_date.desc()).limit(10)
    )).scalars().all()
    # Prescriptions
    rxs = (await db.execute(
        select(Prescription).where(Prescription.patient_id == patient_id).order_by(Prescription.start_date.desc()).limit(10)
    )).scalars().all()

    history = []
    if recs:
        history.append("## Visits")
        for r in recs:
            history.append(f"- {r.visit_date}: Symptoms: {r.symptoms or 'N/A'} | Dx: {r.diagnosis or 'N/A'}")
    if rxs:
        history.append("\n## Prescriptions")
        for rx in rxs:
            history.append(f"- {rx.start_date}: {rx.medicine_normalized or rx.medicine_name} {rx.dosage or ''} {rx.frequency or ''} ({rx.status})")

    return "\n".join(history) if history else "No history found for this patient."

# ─────────────────────────────────────────────
#  OPENAI TOOL DEFINITIONS
# ─────────────────────────────────────────────
DOCTOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": "Search patient's documents semantically. Returns relevant chunks with sources.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "patient_id": {"type": "string"},
                },
                "required": ["query", "patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_patient_history",
            "description": "Get complete patient visit and prescription history.",
            "parameters": {
                "type": "object",
                "properties": {"patient_id": {"type": "string"}},
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "normalize_drug_name",
            "description": "Convert Pakistani brand name to generic name. E.g. Loprin → Aspirin.",
            "parameters": {
                "type": "object",
                "properties": {"drug_name": {"type": "string"}},
                "required": ["drug_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_drug_contradictions",
            "description": "Check if a drug is safe given patient's current medications.",
            "parameters": {
                "type": "object",
                "properties": {
                    "new_drug": {"type": "string"},
                    "patient_id": {"type": "string"},
                },
                "required": ["new_drug", "patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_lab_trends",
            "description": "Get lab value trends for a patient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "test_name": {"type": "string"},
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "predict_adherence",
            "description": "Calculate medication adherence score for a patient.",
            "parameters": {
                "type": "object",
                "properties": {"patient_id": {"type": "string"}},
                "required": ["patient_id"],
            },
        },
    },
]

# ─────────────────────────────────────────────
#  TOOL EXECUTOR
# ─────────────────────────────────────────────
async def execute_tool(tool_name: str, args: dict, doctor: User, db: AsyncSession) -> str:
    if tool_name == "search_documents":
        results = await _doc_search(args["query"], args["patient_id"], doctor, db)
        if not results:
            return "No relevant documents found."
        lines = [
            f"Source: {r['filename']} · Chunk {r['chunk_index']+1} · Uploaded {r['upload_date']} · Confidence: {r['score']}%\n{r['chunk_text'][:400]}"
            for r in results
        ]
        return "\n\n---\n".join(lines)

    elif tool_name == "get_patient_history":
        return await _get_patient_history(args["patient_id"], db)

    elif tool_name == "normalize_drug_name":
        drug = args["drug_name"]
        generic = normalize_drug_name_local(drug)
        if generic:
            return f"'{drug}' → '{generic}' (from local alias dictionary)"
        # Fallback: ask Groq
        client = get_openai_client()
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": f"What is the generic drug name of '{drug}'? Reply with only the generic name."}],
            max_tokens=30,
        )
        return f"'{drug}' → '{resp.choices[0].message.content.strip()}' (Groq/Llama-3.3)"

    elif tool_name == "check_drug_contradictions":
        new_drug = args["new_drug"]
        patient_id = args["patient_id"]
        rxs = (await db.execute(
            select(Prescription).where(Prescription.patient_id == patient_id, Prescription.status == "active")
        )).scalars().all()
        current_meds = [rx.medicine_normalized or rx.medicine_name for rx in rxs]

        if not current_meds:
            return json.dumps({"status": "safe", "explanation": "No active medications on record.", "severity_score": 0})

        client = get_openai_client()
        prompt = (
            f"Patient's current medications: {', '.join(current_meds)}\n"
            f"Proposed new drug: {new_drug}\n"
            "Assess contraindications. Return JSON: "
            '{"status": "safe|warning|critical", "explanation": "...", "severity_score": 0-10, "interactions": []}'
        )
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": DOCTOR_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=400,
        )
        return resp.choices[0].message.content

    elif tool_name == "analyze_lab_trends":
        patient_id = args["patient_id"]
        test_name = args.get("test_name", "")
        q = select(LabValue).join(LabReport, LabValue.lab_report_id == LabReport.id).where(LabReport.patient_id == patient_id)
        if test_name:
            q = q.where(LabValue.test_name.ilike(f"%{test_name}%"))
        vals = (await db.execute(q.order_by(LabValue.recorded_at.desc()).limit(20))).scalars().all()
        if not vals:
            return "No lab values found."
        lines = [f"{v.test_name}: {v.value} {v.unit or ''} (ref: {v.reference_low}-{v.reference_high}) — {v.status}" for v in vals]
        return "\n".join(lines)

    elif tool_name == "predict_adherence":
        patient_id = args["patient_id"]
        rxs = (await db.execute(
            select(Prescription).where(Prescription.patient_id == patient_id)
        )).scalars().all()
        if not rxs:
            return json.dumps({"adherence_score": 0, "risk_level": "Unknown", "missed_refills": 0, "next_refill_forecast": None})
        active = [r for r in rxs if r.status == "active"]
        total = len(rxs)
        missed = max(0, total - len(active))
        score = round(len(active) / max(total, 1) * 100, 1)
        risk = "Low" if score > 80 else "Medium" if score > 50 else "High"
        next_refill = None
        for rx in active:
            if rx.start_date and rx.duration_days:
                end = rx.start_date + timedelta(days=rx.duration_days)
                if not next_refill or end < next_refill:
                    next_refill = end
        return json.dumps({
            "adherence_score": score,
            "risk_level": risk,
            "missed_refills": missed,
            "next_refill_forecast": str(next_refill) if next_refill else None,
        })

    return f"Unknown tool: {tool_name}"

# ─────────────────────────────────────────────
#  CORE AGENT LOOP
# ─────────────────────────────────────────────
async def run_doctor_agent(
    query: str, patient_id: str | None, doctor: User, db: AsyncSession,
    extra_system: str = ""
) -> dict:
    """
    GPT-4o-mini agentic loop with function calling.
    Loops until finish_reason == 'stop'.
    Returns: {answer, tools_called, steps, confidence, tokens, cost}
    """
    client = get_openai_client()
    messages = [
        {"role": "system", "content": DOCTOR_SYSTEM_PROMPT + extra_system},
        {"role": "user", "content": query + (f"\n\nPatient ID: {patient_id}" if patient_id else "")},
    ]
    tools_called = []
    steps = [{"step": 1, "label": "Analyzing query..."}]
    total_tokens = 0
    step_num = 2

    for iteration in range(8):   # max 8 tool calls
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            tools=DOCTOR_TOOLS,
            tool_choice="auto",
            max_tokens=1000,
        )
        total_tokens += resp.usage.total_tokens if resp.usage else 0
        choice = resp.choices[0]

        if choice.finish_reason == "stop":
            break

        if choice.finish_reason == "tool_calls":
            msg = choice.message
            messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
                {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ]})

            for tc in msg.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments)
                tools_called.append(fn_name)
                steps.append({"step": step_num, "label": f"Running {fn_name}...", "tool": fn_name})
                step_num += 1

                tool_result = await execute_tool(fn_name, fn_args, doctor, db)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": tool_result,
                })
        else:
            break

    # Final response
    final_resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=1200,
    )
    total_tokens += final_resp.usage.total_tokens if final_resp.usage else 0
    answer = final_resp.choices[0].message.content or ""
    steps.append({"step": step_num, "label": "Generating clinical summary..."})

    cost = calculate_cost("groq", total_tokens, 0)
    return {
        "answer": answer,
        "tools_called": list(dict.fromkeys(tools_called)),  # deduplicate, preserve order
        "steps": steps,
        "model": "Groq / Llama-3.3",
        "tokens": total_tokens,
        "cost_usd": cost,
        "disclaimer": "Clinical AI output — final decision rests with the clinician.",
    }

# ─────────────────────────────────────────────
#  TAB 1 — Q&A
# ─────────────────────────────────────────────
@router.post("/query")
async def doctor_query(
    body: DoctorQueryRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    t0 = time.time()
    result = await run_doctor_agent(body.query, body.patient_id, doctor, db)
    result["response_time_ms"] = int((time.time() - t0) * 1000)
    return result

# ─────────────────────────────────────────────
#  TAB 2 — TREATMENT SUGGESTIONS
# ─────────────────────────────────────────────
@router.post("/suggest")
async def treatment_suggest(
    body: TreatmentRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    query = (
        f"Patient presents with: {body.presenting_complaint}. "
        "Please: 1) Review patient history, 2) Search documents for guidelines, "
        "3) Check drug contraindications, 4) Suggest treatment options with dosages and monitoring plan."
    )
    return await run_doctor_agent(query, body.patient_id, doctor, db)

# ─────────────────────────────────────────────
#  TAB 3 — PHARMACY & ADHERENCE
# ─────────────────────────────────────────────
@router.post("/pharmacy-predict")
async def pharmacy_predict(
    body: PharmacyRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    query = (
        "Analyze medication adherence for this patient. "
        "Calculate adherence score, identify missed refills, forecast next refill date, "
        "and assess non-adherence risk. Format as a structured clinical summary."
    )
    return await run_doctor_agent(query, body.patient_id, doctor, db)

# ─────────────────────────────────────────────
#  TAB 4 — RISK FORECAST
# ─────────────────────────────────────────────
@router.post("/risk-forecast")
async def risk_forecast(
    body: RiskRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    query = (
        f"Generate a {body.horizon_days}-day health risk forecast for this patient. "
        "Include: readmission risk %, disease progression indicators, "
        "complication flags from comorbidities, and recommended investigations. "
        "Cite specific documents and lab values as evidence."
    )
    return await run_doctor_agent(query, body.patient_id, doctor, db)

# ─────────────────────────────────────────────
#  TAB 5 — LAB ANALYSIS
# ─────────────────────────────────────────────
@router.post("/analyze-lab")
async def analyze_lab(
    body: LabRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    query = (
        "Analyze lab report values for this patient. "
        "Identify abnormal values (HIGH/LOW/CRITICAL), show trends vs previous results, "
        "suggest clinical action per abnormal result, and check if values are explained by current medications."
    )
    return await run_doctor_agent(query, body.patient_id, doctor, db)

# ─────────────────────────────────────────────
#  TAB 6 — CONTRAINDICATION CHECK
# ─────────────────────────────────────────────
@router.post("/contraindication")
async def check_contraindication(
    body: ContraindicationRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    query = (
        f"Is it safe to prescribe '{body.drug_name}' to this patient? "
        "Step 1: Get patient history. Step 2: Normalize the drug name. "
        "Step 3: Check all drug contradictions with current medications. "
        "Return: SAFE / WARNING / CRITICAL with full reasoning and severity score."
    )
    return await run_doctor_agent(query, body.patient_id, doctor, db)

# ─────────────────────────────────────────────
#  AGENT ENDPOINT
# ─────────────────────────────────────────────
@router.post("/agent")
async def doctor_agent(
    body: AgentRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    return await run_doctor_agent(body.query, body.patient_id, doctor, db)
