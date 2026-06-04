"""
MediTrace — Doctor-scoped AI feature endpoints
  POST /doctor/patient/{id}/check-interaction   → drug interaction check
  GET  /doctor/patient/{id}/progress/preview    → progress data (JSON)
  GET  /doctor/patient/{id}/progress/download   → progress PDF
"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import require_role
from database import get_db
from models import User, Prescription, MedicalRecord

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Doctor AI Features"])


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_patient_for_doctor(
    patient_id: str,
    doctor: User,
    db: AsyncSession,
) -> User:
    """
    Return the patient User row if this doctor is authorised to access them.
    Admins can access any patient. Raises 404/403 otherwise.
    """
    patient = (await db.execute(
        select(User).where(User.id == patient_id, User.role == "patient")
    )).scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if doctor.role != "admin" and patient.assigned_doctor_id != doctor.id:
        raise HTTPException(
            status_code=403,
            detail="This patient is not assigned to you",
        )

    return patient


# ─────────────────────────────────────────────────────────────────────────────
#  FEATURE 2 — Drug Interaction Checker
# ─────────────────────────────────────────────────────────────────────────────

class InteractionRequest(BaseModel):
    new_drug: str


@router.post("/doctor/patient/{patient_id}/check-interaction")
async def check_drug_interaction(
    patient_id: str,
    body: InteractionRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """
    Check a new drug against the patient's active medications.
    Returns SAFE / CAUTION / DANGEROUS verdict in < 2 seconds.

    - Hardcoded pairs:  instant (no API call)
    - Unknown pairs:    Grok / llama-3.3-70b-versatile (~1s)
    """
    # Validate patient access
    patient = await _get_patient_for_doctor(patient_id, doctor, db)

    # Load active prescriptions
    active_rxs = (await db.execute(
        select(Prescription)
        .where(
            Prescription.patient_id == patient_id,
            Prescription.status == "active",
        )
    )).scalars().all()

    active_meds = [
        {"name": rx.medicine_normalized or rx.medicine_name,
         "dosage": rx.dosage or "",
         "frequency": rx.frequency or ""}
        for rx in active_rxs
    ]

    # Build brief patient context for the AI
    records = (await db.execute(
        select(MedicalRecord)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.visit_date.desc())
        .limit(3)
    )).scalars().all()

    diagnoses = ", ".join(r.diagnosis for r in records if r.diagnosis) or ""
    patient_context = f"Patient: {patient.full_name or 'Unknown'}."
    if diagnoses:
        patient_context += f" Known conditions: {diagnoses}."

    from ai.drug_checker import check_interactions
    result = await check_interactions(
        new_drug=body.new_drug,
        active_medications=active_meds,
        patient_context=patient_context,
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
#  FEATURE 1 — Patient Progress Report
# ─────────────────────────────────────────────────────────────────────────────

def _validate_days(days: int) -> int:
    if days not in (30, 90):
        raise HTTPException(400, detail="days must be 30 or 90")
    return days


@router.get("/doctor/patient/{patient_id}/progress/preview")
async def get_progress_preview(
    patient_id: str,
    days: int = Query(30, description="Period in days: 30 or 90"),
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """
    Return progress report data as JSON.
    Generates AI commentary via Gemini 2.5 Flash.
    """
    _validate_days(days)
    await _get_patient_for_doctor(patient_id, doctor, db)

    from ai.progress_report import build_progress_data
    data = await build_progress_data(patient_id, days, db, doctor.id)

    if "error" in data:
        raise HTTPException(404, detail=data["error"])

    return data


@router.get("/doctor/patient/{patient_id}/progress/download")
async def download_progress_pdf(
    patient_id: str,
    days: int = Query(30, description="Period in days: 30 or 90"),
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """
    Generate progress report PDF and return it as a downloadable file.
    """
    _validate_days(days)
    patient = await _get_patient_for_doctor(patient_id, doctor, db)

    from ai.progress_report import build_progress_data
    from ai.report_pdf import generate_progress_pdf

    data = await build_progress_data(patient_id, days, db, doctor.id)
    if "error" in data:
        raise HTTPException(404, detail=data["error"])

    pdf_bytes = generate_progress_pdf(data)

    pid_short = patient_id[:8].upper()
    today     = datetime.utcnow().strftime("%Y%m%d")
    filename  = f"ProgressReport_{pid_short}_{days}d_{today}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
