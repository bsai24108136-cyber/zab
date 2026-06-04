"""
MediTrace — AI Clinical Summary Generator
Uses Gemini 2.5 Flash (long-context) to produce structured 6-section summaries.
Results are cached in memory for 1 hour to avoid repeated API calls.
"""
import re
import logging
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.router import call_ai

logger = logging.getLogger(__name__)

# ── In-memory cache: patient_id → {data, expires_at} ─────────────────────────
_summary_cache: dict[str, dict] = {}
CACHE_TTL_MINUTES = 60


def _cache_get(patient_id: str) -> dict | None:
    entry = _summary_cache.get(patient_id)
    if entry and datetime.utcnow() < entry["expires_at"]:
        return entry["data"]
    _summary_cache.pop(patient_id, None)
    return None


def _cache_set(patient_id: str, data: dict):
    _summary_cache[patient_id] = {
        "data": data,
        "expires_at": datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES),
    }


async def generate_clinical_summary(patient_id: str, db: AsyncSession) -> dict:
    """Generate (or return cached) clinical summary for a patient."""
    # Check cache first
    cached = _cache_get(patient_id)
    if cached:
        logger.info(f"[Summary] Cache hit for patient {patient_id}")
        return cached

    # Lazy imports to avoid circular deps
    from models import User, MedicalRecord, Prescription, LabReport

    patient_result = await db.execute(select(User).where(User.id == patient_id))
    patient = patient_result.scalar_one_or_none()
    if not patient:
        return {"error": "Patient not found"}

    records_result = await db.execute(
        select(MedicalRecord)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.visit_date.desc())
        .limit(20)
    )
    records = records_result.scalars().all()

    rx_result = await db.execute(
        select(Prescription).where(
            Prescription.patient_id == patient_id,
            Prescription.status == "active",
        )
    )
    rxs = rx_result.scalars().all()

    labs_result = await db.execute(
        select(LabReport)
        .where(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at.desc())
        .limit(10)
    )
    labs = labs_result.scalars().all()

    records_text = (
        "\n".join(
            f"[{r.visit_date}] Symptoms: {r.symptoms or 'N/A'} | Dx: {r.diagnosis or 'N/A'}"
            for r in records
        )
        or "No records"
    )
    rx_text = (
        "\n".join(
            f"- {r.medicine_name} {r.dosage or ''} {r.frequency or ''}".strip()
            for r in rxs
        )
        or "No active prescriptions"
    )
    lab_text = (
        "\n".join(
            f"[{r.uploaded_at.date() if r.uploaded_at else 'N/A'}] Status: {r.result_status or 'N/A'} | Note: {r.doctor_note or 'N/A'}"
            for r in labs
        )
        or "No lab reports"
    )

    result = await call_ai(
        "summarize",
        f"""Generate a structured clinical summary.
Return EXACTLY in this format with these headings:

PRIMARY CONDITIONS: [diagnoses with estimated duration]
CURRENT MEDICATIONS: [active drugs with doses]
RECENT TRENDS: [lab/symptom changes — improving or worsening with dates]
MEDICATION ADHERENCE: [good/poor/unknown — inferred from records]
RISK FLAGS: [urgent concerns, or NONE]
OVERALL STATUS: [one sentence trajectory]

Patient data:
Name: {patient.full_name or 'Unknown'}
Blood Group: Unknown

Recent visits:
{records_text}

Active prescriptions:
{rx_text}

Recent lab reports:
{lab_text}""",
        "You are a senior clinician summarizing a patient chart concisely.",
    )

    sections = _parse_sections(result["text"])
    data = {
        "summary": sections,
        "raw": result["text"],
        "model": result["model"],
        "generated_at": datetime.utcnow().isoformat(),
        "ok": result["ok"],
    }

    _cache_set(patient_id, data)
    return data


def invalidate_cache(patient_id: str):
    """Call this after new records/labs are uploaded for the patient."""
    _summary_cache.pop(patient_id, None)


def _parse_sections(text: str) -> dict:
    keys = [
        "PRIMARY CONDITIONS",
        "CURRENT MEDICATIONS",
        "RECENT TRENDS",
        "MEDICATION ADHERENCE",
        "RISK FLAGS",
        "OVERALL STATUS",
    ]
    out = {}
    for i, key in enumerate(keys):
        next_key = keys[i + 1] if i + 1 < len(keys) else None
        pattern = (
            rf"{key}:\s*(.+?)(?={next_key}:|$)"
            if next_key
            else rf"{key}:\s*(.+?)$"
        )
        m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        slug = key.lower().replace(" ", "_")
        out[slug] = m.group(1).strip() if m else ""
    return out
