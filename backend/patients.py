"""
MediTrace — Patients Router (Doctor-side)
Doctors create patients, get THEIR patient list, full per-patient summary
"""
import uuid, secrets, string
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import require_role, get_current_user, hash_password
from database import get_db
from models import User, Document, MedicalRecord, Prescription, LabReport

router = APIRouter(prefix="/doctor", tags=["Doctor – Patient Management"])


def generate_password(length: int = 10) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))


# ── Create Patient ──────────────────────────────────────────────────────────
class CreatePatientRequest(BaseModel):
    full_name: str
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    notes: Optional[str] = None


@router.post("/patients/create")
async def create_patient(
    body: CreatePatientRequest,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """
    Doctor creates a new patient account.
    Auto-assigns this patient to the creating doctor.
    Returns credentials to hand to the patient.
    """
    uid = str(uuid.uuid4())[:8].upper()
    email = f"patient.{uid.lower()}@meditrace.local"
    raw_password = generate_password()

    patient = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=hash_password(raw_password),
        role="patient",
        full_name=body.full_name,
        phone=body.phone,
        assigned_doctor_id=doctor.id,   # auto-assign to creating doctor
        is_active=True,
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)

    return {
        "patient_id": patient.id,
        "full_name": patient.full_name,
        "email": email,
        "password": raw_password,          # shown once
        "patient_code": uid,
        "assigned_doctor": doctor.full_name,
        "message": "Patient created and assigned to you. Share these credentials with the patient.",
    }


# ── List MY Patients (scoped to this doctor) ─────────────────────────────────
@router.get("/patients")
async def list_doctor_patients(
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """
    Returns patients assigned to this doctor.
    Admins see ALL patients.
    """
    if doctor.role == "admin":
        result = await db.execute(
            select(User).where(User.role == "patient").order_by(User.created_at.desc())
        )
    else:
        result = await db.execute(
            select(User)
            .where(User.role == "patient", User.assigned_doctor_id == doctor.id)
            .order_by(User.created_at.desc())
        )
    patients = result.scalars().all()
    return [
        {
            "id": p.id,
            "full_name": p.full_name,
            "email": p.email,
            "phone": p.phone,
            "is_active": p.is_active,
            "assigned_doctor_id": p.assigned_doctor_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in patients
    ]


# ── Full Patient Summary (per-patient tab) ──────────────────────────────────
@router.get("/patients/{patient_id}/summary")
async def patient_summary(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Returns complete patient record: profile, documents, records, prescriptions, labs."""
    pat = (await db.execute(select(User).where(User.id == patient_id))).scalar_one_or_none()
    if not pat or pat.role != "patient":
        raise HTTPException(404, "Patient not found")

    # Scope check: doctor can only view their assigned patients (admin unrestricted)
    if doctor.role == "doctor" and pat.assigned_doctor_id != doctor.id:
        raise HTTPException(403, "This patient is not assigned to you")

    # Documents
    docs = (await db.execute(
        select(Document).where(
            (Document.patient_id == patient_id) | (Document.user_id == patient_id)
        ).order_by(Document.upload_date.desc())
    )).scalars().all()
    # Deduplicate
    seen = set(); unique_docs = []
    for d in docs:
        if d.id not in seen:
            seen.add(d.id); unique_docs.append(d)

    # Medical records
    records = (await db.execute(
        select(MedicalRecord).where(MedicalRecord.patient_id == patient_id)
                              .order_by(MedicalRecord.visit_date.desc())
    )).scalars().all()

    # Prescriptions (with doctor names)
    rxs = (await db.execute(
        select(Prescription).where(Prescription.patient_id == patient_id)
                              .order_by(Prescription.start_date.desc())
    )).scalars().all()

    # Lab reports
    labs = (await db.execute(
        select(LabReport).where(LabReport.patient_id == patient_id)
                          .order_by(LabReport.uploaded_at.desc())
    )).scalars().all()

    return {
        "profile": {
            "id": pat.id,
            "full_name": pat.full_name,
            "email": pat.email,
            "phone": pat.phone,
            "is_active": pat.is_active,
            "assigned_doctor_id": pat.assigned_doctor_id,
            "created_at": pat.created_at.isoformat() if pat.created_at else None,
        },
        "documents": [
            {
                "id": d.id, "filename": d.filename, "file_type": d.file_type,
                "status": d.status, "upload_date": d.upload_date.isoformat() if d.upload_date else None,
                "chunk_count": d.chunk_count,
            }
            for d in unique_docs
        ],
        "medical_records": [
            {
                "id": r.id, "visit_date": str(r.visit_date),
                "symptoms": r.symptoms, "diagnosis": r.diagnosis, "notes": r.notes,
            }
            for r in records
        ],
        "prescriptions": [
            {
                "id": r.id, "rx_number": r.rx_number,
                "medicine_name": r.medicine_name,
                "medicine_normalized": r.medicine_normalized,
                "dosage": r.dosage, "frequency": r.frequency,
                "instructions": r.instructions,
                "duration_days": r.duration_days, "start_date": str(r.start_date),
                "status": r.status,
            }
            for r in rxs
        ],
        "lab_reports": [
            {
                "id": r.id, "result_status": r.result_status,
                "doctor_note": r.doctor_note,
                "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            }
            for r in labs
        ],
    }
