"""
MediTrace — Medical Records, Prescriptions, Lab Reports Router
Full CRUD for prescriptions: create, list, update (edit), cancel
"""
import uuid, io, logging
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel, Field
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import get_current_user, require_role
from database import get_db
from models import User, MedicalRecord, Prescription, LabReport, LabValue

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Medical Records"])


# ─── MEDICAL RECORDS ───────────────────────────────────────────────────────

class MedicalRecordCreate(BaseModel):
    patient_id: str
    symptoms: Optional[str] = None
    diagnosis: Optional[str] = None
    notes: Optional[str] = None
    visit_date: date


@router.post("/medical-records/")
async def create_medical_record(
    body: MedicalRecordCreate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    record = MedicalRecord(
        id=str(uuid.uuid4()),
        patient_id=body.patient_id,
        doctor_id=doctor.id,
        symptoms=body.symptoms,
        diagnosis=body.diagnosis,
        notes=body.notes,
        visit_date=body.visit_date,
    )
    db.add(record)
    await db.commit()
    return {"id": record.id, "message": "Medical record created"}


@router.get("/medical-records/{patient_id}")
async def get_medical_records(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(MedicalRecord)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.visit_date.desc())
    )
    records = result.scalars().all()
    return [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "doctor_id": r.doctor_id,
            "symptoms": r.symptoms,
            "diagnosis": r.diagnosis,
            "notes": r.notes,
            "visit_date": str(r.visit_date),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


# ─── PRESCRIPTIONS ─────────────────────────────────────────────────────────

class PrescriptionCreate(BaseModel):
    patient_id: str
    medicine_name: str
    medicine_normalized: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    instructions: Optional[str] = None   # e.g. "Take with food, morning and evening"
    duration_days: Optional[int] = None
    start_date: date


class PrescriptionUpdate(BaseModel):
    medicine_name: Optional[str] = None
    medicine_normalized: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    instructions: Optional[str] = None
    duration_days: Optional[int] = None
    start_date: Optional[date] = None
    status: Optional[str] = None   # active | completed | cancelled


@router.post("/prescriptions/")
async def create_prescription(
    body: PrescriptionCreate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    rx_number = f"RX-{str(uuid.uuid4())[:8].upper()}"
    from ai_router import normalize_drug_name_local
    normalized = body.medicine_normalized or normalize_drug_name_local(body.medicine_name)

    rx = Prescription(
        id=str(uuid.uuid4()),
        rx_number=rx_number,
        patient_id=body.patient_id,
        doctor_id=doctor.id,
        medicine_name=body.medicine_name,
        medicine_normalized=normalized,
        dosage=body.dosage,
        frequency=body.frequency,
        instructions=body.instructions,
        duration_days=body.duration_days,
        start_date=body.start_date,
    )
    db.add(rx)
    await db.commit()
    return {"id": rx.id, "rx_number": rx_number, "message": "Prescription created"}


@router.patch("/prescriptions/{rx_id}")
async def update_prescription(
    rx_id: str,
    body: PrescriptionUpdate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Doctor edits an existing prescription (dosage, frequency, instructions, status, etc.)"""
    result = await db.execute(select(Prescription).where(Prescription.id == rx_id))
    rx = result.scalar_one_or_none()
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")

    # Only the prescribing doctor (or admin) can edit
    if doctor.role != "admin" and rx.doctor_id != doctor.id:
        raise HTTPException(status_code=403, detail="You did not create this prescription")

    if body.medicine_name is not None:
        rx.medicine_name = body.medicine_name
        from ai_router import normalize_drug_name_local
        rx.medicine_normalized = body.medicine_normalized or normalize_drug_name_local(body.medicine_name) or rx.medicine_normalized
    if body.medicine_normalized is not None:
        rx.medicine_normalized = body.medicine_normalized
    if body.dosage is not None:
        rx.dosage = body.dosage
    if body.frequency is not None:
        rx.frequency = body.frequency
    if body.instructions is not None:
        rx.instructions = body.instructions
    if body.duration_days is not None:
        rx.duration_days = body.duration_days
    if body.start_date is not None:
        rx.start_date = body.start_date
    if body.status is not None:
        if body.status not in ("active", "completed", "cancelled"):
            raise HTTPException(400, "status must be active, completed, or cancelled")
        rx.status = body.status

    await db.commit()
    await db.refresh(rx)
    return {"id": rx.id, "rx_number": rx.rx_number, "message": "Prescription updated"}


@router.delete("/prescriptions/{rx_id}")
async def cancel_prescription(
    rx_id: str,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Cancel / soft-delete a prescription."""
    result = await db.execute(select(Prescription).where(Prescription.id == rx_id))
    rx = result.scalar_one_or_none()
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found")
    if doctor.role != "admin" and rx.doctor_id != doctor.id:
        raise HTTPException(status_code=403, detail="You did not create this prescription")
    rx.status = "cancelled"
    await db.commit()
    return {"message": "Prescription cancelled"}


@router.get("/prescriptions/{patient_id}")
async def get_prescriptions(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(Prescription)
        .where(Prescription.patient_id == patient_id)
        .order_by(Prescription.start_date.desc())
    )
    rxs = result.scalars().all()

    # Fetch prescribing doctor names
    doctor_ids = list({r.doctor_id for r in rxs})
    doctors: dict[str, User] = {}
    if doctor_ids:
        dr_result = await db.execute(select(User).where(User.id.in_(doctor_ids)))
        for dr in dr_result.scalars().all():
            doctors[dr.id] = dr

    return [
        {
            "id": r.id,
            "rx_number": r.rx_number,
            "medicine_name": r.medicine_name,
            "medicine_normalized": r.medicine_normalized,
            "dosage": r.dosage,
            "frequency": r.frequency,
            "instructions": r.instructions,
            "duration_days": r.duration_days,
            "start_date": str(r.start_date),
            "status": r.status,
            "doctor_name": doctors.get(r.doctor_id, None) and doctors[r.doctor_id].full_name or "Unknown Doctor",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rxs
    ]


# ─── LAB REPORTS ───────────────────────────────────────────────────────────

class LabValueInput(BaseModel):
    test_name: str
    value: Optional[float] = None
    unit: Optional[str] = None
    reference_low: Optional[float] = None
    reference_high: Optional[float] = None
    status: Optional[str] = None   # normal|high|low|critical


class LabReportCreate(BaseModel):
    patient_id: str
    doctor_note: Optional[str] = None
    result_status: Optional[str] = "normal"   # normal|abnormal|critical
    lab_values: List[LabValueInput] = []


@router.post("/lab-reports/")
async def create_lab_report(
    body: LabReportCreate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Create a lab report with optional individual lab values."""
    lab = LabReport(
        id=str(uuid.uuid4()),
        patient_id=body.patient_id,
        doctor_id=doctor.id,
        result_status=body.result_status,
        doctor_note=body.doctor_note,
    )
    db.add(lab)
    await db.flush()   # get lab.id before adding values

    for v in body.lab_values:
        lv = LabValue(
            id=str(uuid.uuid4()),
            lab_report_id=lab.id,
            test_name=v.test_name,
            value=v.value,
            unit=v.unit,
            reference_low=v.reference_low,
            reference_high=v.reference_high,
            status=v.status,
            recorded_at=date.today(),
        )
        db.add(lv)

    await db.commit()
    return {"id": lab.id, "message": "Lab report created"}


@router.get("/lab-reports/{patient_id}")
async def get_lab_reports(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(LabReport)
        .where(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at.desc())
    )
    reports = result.scalars().all()

    out = []
    for r in reports:
        values_result = await db.execute(
            select(LabValue).where(LabValue.lab_report_id == r.id)
        )
        values = values_result.scalars().all()
        out.append({
            "id": r.id,
            "result_status": r.result_status,
            "doctor_note": r.doctor_note,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "lab_values": [
                {
                    "test_name": v.test_name,
                    "value": v.value,
                    "unit": v.unit,
                    "reference_low": v.reference_low,
                    "reference_high": v.reference_high,
                    "status": v.status,
                }
                for v in values
            ],
        })
    return out


@router.get("/lab-reports/all/doctor")
async def get_all_lab_reports_for_doctor(
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Get all lab reports the doctor has created."""
    result = await db.execute(
        select(LabReport)
        .where(LabReport.doctor_id == doctor.id)
        .order_by(LabReport.uploaded_at.desc())
    )
    reports = result.scalars().all()
    return [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "result_status": r.result_status,
            "doctor_note": r.doctor_note,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
        }
        for r in reports
    ]


# ─── LAB REPORT FILE UPLOAD + AI ANALYSIS ─────────────────────────────────

ALLOWED_LAB_TYPES = {"pdf", "txt", "docx", "csv"}
MAX_LAB_FILE = 5 * 1024 * 1024  # 5MB


def _extract_text(file_bytes: bytes, ext: str) -> str:
    """Reuse extraction logic without circular import."""
    if ext == "pdf":
        # pyrefly: ignore [missing-import]
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        return "\n\n".join(p.get_text() for p in doc if p.get_text().strip())
    elif ext == "docx":
        from docx import Document as DocxDoc
        doc = DocxDoc(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    elif ext == "csv":
        import csv
        content = file_bytes.decode("utf-8", errors="replace").lstrip("\ufeff")  # strip BOM
        rows = []
        for row in csv.DictReader(io.StringIO(content)):
            cells = []
            for k, v in row.items():
                if k is None:          # extra columns land here as a list — skip
                    continue
                v_str = ", ".join(v) if isinstance(v, list) else str(v or "")
                if v_str.strip():
                    cells.append(f"{k}: {v_str}")
            if cells:
                rows.append(", ".join(cells))
        return "\n".join(rows)
    else:
        return file_bytes.decode("utf-8", errors="replace")


@router.post("/lab-reports/upload-analyze")
async def upload_and_analyze_lab_report(
    background_tasks: BackgroundTasks,
    patient_id: str = Form(...),
    doctor_note: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """
    Upload a lab report file (PDF/DOCX/TXT/CSV).
    Extracts text → runs Gemini AI analysis → saves LabReport record.
    """
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_LAB_TYPES:
        raise HTTPException(400, f"Only PDF, DOCX, TXT, CSV files allowed. Got: .{ext}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_LAB_FILE:
        raise HTTPException(400, "File exceeds 5MB limit.")

    try:
        raw_text = _extract_text(file_bytes, ext)
    except Exception as e:
        raise HTTPException(422, f"Could not read file: {e}")

    if not raw_text.strip():
        raise HTTPException(422, "File appears to be empty or unreadable.")

    # ── AI analysis ──────────────────────────────────────────────────────────
    ai_analysis = None
    result_status = "normal"
    ai_summary = None

    try:
        from ai.router import call_ai
        import json

        prompt = f"""You are a clinical pathologist AI. Analyze this lab report text and return a structured JSON response.

LAB REPORT TEXT:
{raw_text[:4000]}

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{{
  "overall_status": "normal" | "abnormal" | "critical",
  "summary": "2-3 sentence plain English summary of findings",
  "key_findings": [
    {{"test": "test name", "value": "value with unit", "status": "normal|high|low|critical", "clinical_note": "brief interpretation"}}
  ],
  "red_flags": ["list of concerning findings requiring immediate attention"],
  "recommendations": ["list of suggested follow-up actions"],
  "disclaimer": "AI interpretation only. Clinical judgment required."
}}"""

        ai_result = await call_ai("summarize", prompt,
                                  "You are a clinical pathologist. Return only valid JSON.")
        text = ai_result["text"].strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        ai_analysis = json.loads(text.strip())
        result_status = ai_analysis.get("overall_status", "normal")
        ai_summary = ai_analysis.get("summary")

    except Exception as e:
        logger.warning(f"Lab AI analysis failed: {e}")
        ai_analysis = {"error": str(e)}

    # ── Save LabReport record ─────────────────────────────────────────────────
    lab = LabReport(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        doctor_id=doctor.id,
        result_status=result_status,
        doctor_note=doctor_note or ai_summary or f"Uploaded: {file.filename}",
    )
    db.add(lab)
    await db.commit()
    await db.refresh(lab)

    # ── Fire autonomous check in background ────────────────────────────────────
    try:
        from ai.autonomous import run_autonomous_check
        from database import AsyncSessionLocal
        import asyncio

        async def _auto_check():
            async with AsyncSessionLocal() as bg_db:
                await run_autonomous_check(
                    lab.id, patient_id, doctor.id, raw_text, bg_db
                )

        background_tasks.add_task(asyncio.create_task, _auto_check())
    except Exception as _bg_e:
        logger.warning(f"Could not start autonomous check: {_bg_e}")

    return {
        "lab_report_id": lab.id,
        "filename": file.filename,
        "extracted_text_preview": raw_text[:500],
        "ai_analysis": ai_analysis,
        "result_status": result_status,
        "saved": True,
        "message": "Lab report uploaded and analysed successfully.",
    }
