"""
MediTrace — Admin Router
User management, cost monitoring, audit log, system health,
doctor creation, doctor-patient assignments
"""
from datetime import datetime, timedelta
from typing import Optional
import uuid, json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from auth import get_current_user, require_role, hash_password
from database import get_db
from models import (
    User, Document, DocumentChunk, Embedding, Search,
    SatAIInteraction, DoctorAIQuery, PatientChatSession
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─── USER LIST ──────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "role": u.role,
            "full_name": u.full_name,
            "specialization": u.specialization,
            "is_active": u.is_active,
            "assigned_doctor_id": u.assigned_doctor_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


# ─── TOGGLE USER ────────────────────────────────────────────────────────────

class ToggleUserRequest(BaseModel):
    user_id: str
    is_active: bool


@router.post("/users/toggle")
async def toggle_user(
    body: ToggleUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == body.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = body.is_active
    await db.commit()
    return {"message": f"User {'activated' if body.is_active else 'deactivated'}"}


# ─── RESET PASSWORD ──────────────────────────────────────────────────────────

class ResetPasswordRequest(BaseModel):
    user_id: str
    new_password: str


@router.post("/users/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == body.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": f"Password reset for {user.email}"}


# ─── CREATE DOCTOR ───────────────────────────────────────────────────────────

class CreateDoctorRequest(BaseModel):
    full_name: str
    email: str
    password: str
    specialization: Optional[str] = None
    phone: Optional[str] = None


@router.post("/users/create-doctor", status_code=201)
async def create_doctor(
    body: CreateDoctorRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Admin creates a new doctor account."""
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Email already in use")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    doctor = User(
        id=str(uuid.uuid4()),
        email=body.email.lower().strip(),
        password_hash=hash_password(body.password),
        role="doctor",
        full_name=body.full_name,
        specialization=body.specialization,
        phone=body.phone,
        is_active=True,
    )
    db.add(doctor)
    await db.commit()
    await db.refresh(doctor)
    return {
        "id": doctor.id,
        "email": doctor.email,
        "full_name": doctor.full_name,
        "specialization": doctor.specialization,
        "message": "Doctor account created successfully",
    }


# ─── LIST DOCTORS ────────────────────────────────────────────────────────────

@router.get("/doctors")
async def list_doctors(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """List all doctors with their patient counts."""
    doctors = (await db.execute(
        select(User).where(User.role == "doctor").order_by(User.created_at.desc())
    )).scalars().all()

    # Count patients per doctor
    all_patients = (await db.execute(
        select(User).where(User.role == "patient")
    )).scalars().all()
    patient_counts: dict[str, int] = {}
    for p in all_patients:
        if p.assigned_doctor_id:
            patient_counts[p.assigned_doctor_id] = patient_counts.get(p.assigned_doctor_id, 0) + 1

    return [
        {
            "id": d.id,
            "email": d.email,
            "full_name": d.full_name,
            "specialization": d.specialization,
            "phone": d.phone,
            "is_active": d.is_active,
            "patient_count": patient_counts.get(d.id, 0),
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in doctors
    ]


# ─── ASSIGN PATIENT TO DOCTOR ────────────────────────────────────────────────

class AssignPatientRequest(BaseModel):
    patient_id: str
    doctor_id: str   # pass "" or None to unassign


@router.post("/assign-patient")
async def assign_patient_to_doctor(
    body: AssignPatientRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Admin reassigns a patient to a different doctor."""
    patient = (await db.execute(select(User).where(User.id == body.patient_id))).scalar_one_or_none()
    if not patient or patient.role != "patient":
        raise HTTPException(404, "Patient not found")

    if body.doctor_id:
        doctor = (await db.execute(select(User).where(User.id == body.doctor_id))).scalar_one_or_none()
        if not doctor or doctor.role != "doctor":
            raise HTTPException(404, "Doctor not found")
        patient.assigned_doctor_id = body.doctor_id
        msg = f"Patient assigned to {doctor.full_name}"
    else:
        patient.assigned_doctor_id = None
        msg = "Patient unassigned"

    await db.commit()
    return {"message": msg}


# ─── COSTS ────────────────────────────────────────────────────────────────────

@router.get("/costs")
async def cost_monitor(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    result = await db.execute(select(SatAIInteraction))
    interactions = result.scalars().all()

    gemini_calls = [i for i in interactions if i.model_used == "gemini-1.5-flash"]
    gpt_calls = [i for i in interactions if i.model_used == "gpt-4o-mini"]

    gemini_cost = sum(float(i.cost_usd or 0) for i in gemini_calls)
    gpt_cost = sum(float(i.cost_usd or 0) for i in gpt_calls)

    return {
        "gemini": {
            "total_calls": len(gemini_calls),
            "total_tokens": sum(i.tokens_used or 0 for i in gemini_calls),
            "estimated_cost_usd": round(gemini_cost, 4),
        },
        "gpt4o_mini": {
            "total_calls": len(gpt_calls),
            "total_tokens": sum(i.tokens_used or 0 for i in gpt_calls),
            "exact_cost_usd": round(gpt_cost, 4),
        },
        "combined_total_usd": round(gemini_cost + gpt_cost, 4),
        "budget_status": "Under $10" if (gemini_cost + gpt_cost) < 10 else "Over budget",
    }


# ─── AUDIT LOG ────────────────────────────────────────────────────────────────

@router.get("/audit-log")
async def audit_log(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    result = await db.execute(
        select(SatAIInteraction)
        .order_by(SatAIInteraction.load_date.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.hash_key,
            "user_hash": r.user_hash,
            "model_used": r.model_used,
            "tokens_used": r.tokens_used,
            "cost_usd": float(r.cost_usd or 0),
            "response_time_ms": r.response_time_ms,
            "confidence_score": r.confidence_score,
            "timestamp": r.load_date.isoformat() if r.load_date else None,
        }
        for r in rows
    ]


# ─── SYSTEM HEALTH ────────────────────────────────────────────────────────────

@router.get("/system-health")
async def system_health(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    doc_count = (await db.execute(select(func.count(Document.id)))).scalar() or 0
    chunk_count = (await db.execute(select(func.count(DocumentChunk.id)))).scalar() or 0
    emb_count = (await db.execute(select(func.count(Embedding.id)))).scalar() or 0
    user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
    search_count = (await db.execute(select(func.count(Search.id)))).scalar() or 0

    interactions = (await db.execute(select(SatAIInteraction))).scalars().all()
    avg_rt = (
        sum(i.response_time_ms or 0 for i in interactions) / len(interactions)
        if interactions else 0
    )

    return {
        "total_users": user_count,
        "total_documents": doc_count,
        "total_chunks": chunk_count,
        "total_embeddings": emb_count,
        "total_searches": search_count,
        "avg_ai_response_time_ms": round(avg_rt, 1),
        "status": "healthy",
    }


# ─── ANALYTICS ────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def analytics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    docs = (await db.execute(select(Document))).scalars().all()
    interactions = (await db.execute(select(SatAIInteraction))).scalars().all()
    searches = (await db.execute(select(Search))).scalars().all()

    type_counts: dict[str, int] = {}
    for d in docs:
        type_counts[d.file_type] = type_counts.get(d.file_type, 0) + 1

    model_usage: dict[str, int] = {}
    for i in interactions:
        model_usage[i.model_used] = model_usage.get(i.model_used, 0) + 1

    from collections import defaultdict
    from datetime import date
    search_by_day: dict[str, int] = defaultdict(int)
    for s in searches:
        if s.created_at:
            day = s.created_at.date().isoformat()
            search_by_day[day] += 1

    return {
        "file_type_breakdown": [{"name": k, "value": v} for k, v in type_counts.items()],
        "model_usage": [{"name": k, "value": v} for k, v in model_usage.items()],
        "searches_by_day": [{"date": k, "count": v} for k, v in sorted(search_by_day.items())[-7:]],
        "documents_by_day": [],
    }


# ─── ADMIN DOCUMENT MANAGEMENT ──────────────────────────────────────────────

@router.get("/documents")
async def list_all_documents(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    docs = (await db.execute(
        select(Document).order_by(Document.upload_date.desc())
    )).scalars().all()
    users = {u.id: u for u in (await db.execute(select(User))).scalars().all()}

    return [
        {
            "id": d.id,
            "filename": d.filename,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "status": d.status,
            "chunk_count": d.chunk_count,
            "upload_date": d.upload_date.isoformat() if d.upload_date else None,
            "uploader_name": users.get(d.user_id, None) and users[d.user_id].full_name or "Unknown",
            "uploader_email": users.get(d.user_id, None) and users[d.user_id].email or "Unknown",
            "patient_id": d.patient_id,
            "patient_name": (users.get(d.patient_id, None) and users[d.patient_id].full_name) if d.patient_id else None,
        }
        for d in docs
    ]


@router.delete("/documents/{doc_id}")
async def admin_delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    doc = (await db.execute(select(Document).where(Document.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.delete(doc)
    await db.commit()
    return {"message": "Document deleted"}
