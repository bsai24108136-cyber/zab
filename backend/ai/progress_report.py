"""
MediTrace — Patient Progress Report Data Builder
Pulls records, meds, labs for a time-window and generates AI commentary.

AI model: Gemini 2.5 Flash (summarize task) — best for long clinical summaries.
No Claude. No OpenAI.
"""
import logging
from datetime import datetime, timedelta, date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import User, MedicalRecord, Prescription, LabReport
from ai.router import call_ai

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a senior clinician writing a concise doctor-to-doctor handover report. "
    "Use clear, professional clinical language. Be specific about findings, "
    "do not pad the report with caveats. Under 120 words total across 3 paragraphs."
)


def calculate_age(dob) -> str:
    """Return age as string like '54 years', or 'Unknown' if dob is None."""
    if dob is None:
        return "Unknown"
    try:
        today = date.today()
        return str(
            today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        ) + " years"
    except Exception:
        return "Unknown"


async def build_progress_data(
    patient_id: str,
    period_days: int,
    db: AsyncSession,
    doctor_id: str | None = None,
) -> dict:
    """
    Build a complete progress data dict for the given patient + time window.

    Args:
        patient_id:  User.id of the patient
        period_days: 30 or 90
        db:          async DB session
        doctor_id:   if provided, used to validate access (optional here — 
                     endpoint does the gate check before calling this function)

    Returns dict with keys: patient, period, metrics, records, active_rx,
    changed_rx, labs, ai_commentary, ai_model, generated_at
    """
    # ── 1. Load patient row ───────────────────────────────────────────────────
    user = (await db.execute(
        select(User).where(User.id == patient_id)
    )).scalar_one_or_none()

    if not user:
        return {"error": "Patient not found"}

    end_dt   = datetime.utcnow()
    start_dt = end_dt - timedelta(days=period_days)
    start_d  = start_dt.date()
    end_d    = end_dt.date()

    period_label = f"Last {period_days} days ({start_d.strftime('%d %b')} – {end_d.strftime('%d %b %Y')})"

    # ── 2. Query filtered records ─────────────────────────────────────────────
    records = (await db.execute(
        select(MedicalRecord)
        .where(
            MedicalRecord.patient_id == patient_id,
            MedicalRecord.visit_date >= start_d,
            MedicalRecord.visit_date <= end_d,
        )
        .order_by(MedicalRecord.visit_date.asc())
    )).scalars().all()

    # All active prescriptions (not date-filtered — doctor needs current meds)
    active_rx = (await db.execute(
        select(Prescription)
        .where(
            Prescription.patient_id == patient_id,
            Prescription.status == "active",
        )
        .order_by(Prescription.start_date.asc())
    )).scalars().all()

    # Prescriptions started in the period (medication changes)
    changed_rx = (await db.execute(
        select(Prescription)
        .where(
            Prescription.patient_id == patient_id,
            Prescription.created_at >= start_dt,
            Prescription.created_at <= end_dt,
        )
        .order_by(Prescription.created_at.asc())
    )).scalars().all()

    labs = (await db.execute(
        select(LabReport)
        .where(
            LabReport.patient_id == patient_id,
            LabReport.uploaded_at >= start_dt,
            LabReport.uploaded_at <= end_dt,
        )
        .order_by(LabReport.uploaded_at.asc())
    )).scalars().all()

    # ── 3. Build text summaries for AI prompt ─────────────────────────────────
    records_text = "\n".join(
        f"[{r.visit_date}] Dx: {r.diagnosis or 'N/A'} | Symptoms: {r.symptoms or 'N/A'}"
        for r in records
    ) or "No visits recorded in this period."

    rx_text = "\n".join(
        f"- {p.medicine_normalized or p.medicine_name} {p.dosage or ''} "
        f"{p.frequency or ''} (started {p.start_date})"
        for p in changed_rx
    ) or "No new prescriptions in this period."

    labs_text = "\n".join(
        f"[{l.uploaded_at.date() if l.uploaded_at else 'N/A'}] "
        f"{l.result_status or 'N/A'} | {l.doctor_note or 'No note'}"
        for l in labs
    ) or "No lab reports in this period."

    # ── 4. Call Gemini for AI commentary ─────────────────────────────────────
    prompt = f"""Patient: {user.full_name or 'Unknown'}  |  Period: {period_label}

CLINICAL VISITS ({len(records)} total):
{records_text}

MEDICATION CHANGES ({len(changed_rx)} new prescriptions):
{rx_text}

LAB REPORTS ({len(labs)} total):
{labs_text}

Write a concise clinical progress commentary in exactly 3 short paragraphs (under 120 words total):
- Paragraph 1: Clinical activity (visits, main diagnoses this period)
- Paragraph 2: Medication changes (new, stopped, adjusted)
- Paragraph 3: Lab findings and overall clinical trajectory

Write for a doctor reading a handover note. No bullet points. No headings."""

    ai_result = await call_ai("summarize", prompt, _SYSTEM)

    # ── 5. Metrics ────────────────────────────────────────────────────────────
    labs_abnormal = sum(
        1 for l in labs
        if l.result_status in ("abnormal", "critical",
                               "reviewed_abnormal", "reviewed_critical")
    )

    # ── 6. Assemble output ────────────────────────────────────────────────────
    name_parts = (user.full_name or "").split(" ", 1)
    return {
        "patient": {
            "name":        user.full_name or "Unknown",
            "id":          user.id[:8].upper(),
            "dob":         None,     # User model has no DOB column
            "age":         "Unknown",
            "gender":      "Unknown",
            "blood_group": "Unknown",
            "email":       user.email,
        },
        "period": {
            "days":  period_days,
            "start": str(start_d),
            "end":   str(end_d),
            "label": period_label,
        },
        "metrics": {
            "total_visits":  len(records),
            "active_meds":   len(active_rx),
            "med_changes":   len(changed_rx),
            "lab_reports":   len(labs),
            "labs_abnormal": labs_abnormal,
        },
        "records": [
            {
                "date":      str(r.visit_date),
                "diagnosis": r.diagnosis,
                "symptoms":  r.symptoms,
                "notes":     r.notes,
            }
            for r in records
        ],
        "active_rx": [
            {
                "name":      p.medicine_normalized or p.medicine_name,
                "dosage":    p.dosage,
                "frequency": p.frequency,
            }
            for p in active_rx
        ],
        "changed_rx": [
            {
                "name":    p.medicine_normalized or p.medicine_name,
                "dosage":  p.dosage,
                "started": str(p.start_date),
            }
            for p in changed_rx
        ],
        "labs": [
            {
                "date":   l.uploaded_at.date().isoformat() if l.uploaded_at else None,
                "status": l.result_status,
                "note":   l.doctor_note,
            }
            for l in labs
        ],
        "ai_commentary": ai_result.get("text", ""),
        "ai_model":      ai_result.get("model", "Gemini 2.5 Flash"),
        "generated_at":  datetime.utcnow().isoformat() + "Z",
    }
