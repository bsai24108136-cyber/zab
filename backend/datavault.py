"""
MediTrace — Data Vault 2.0 + PIT Snapshot Router
Temporal patient state reconstruction
"""
import hashlib
import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from auth import get_current_user, require_role
from database import get_db
from models import (
    User, HubPatient, HubDocument, SatPatientDetails,
    SatMedicationHistory, SatDocumentContent, PITPatientSnapshot,
    LinkPatientDocument
)

router = APIRouter(tags=["Data Vault"])


def make_hash(value: str) -> str:
    """MD5 hash for Data Vault hash keys."""
    return hashlib.md5(value.encode()).hexdigest()


async def ensure_hub_patient(patient_id: str, db: AsyncSession) -> str:
    """Upsert hub_patients row. Returns hash_key."""
    hash_key = make_hash(patient_id)
    result = await db.execute(select(HubPatient).where(HubPatient.hash_key == hash_key))
    if not result.scalar_one_or_none():
        db.add(HubPatient(
            hash_key=hash_key,
            patient_id=patient_id,
            record_source="MediTrace-API",
        ))
        await db.flush()
    return hash_key


async def write_pit_snapshot(patient_hash: str, db: AsyncSession):
    """Write a new PIT snapshot for today."""
    now = datetime.utcnow()
    pit = PITPatientSnapshot(
        id=str(uuid.uuid4()),
        patient_hash=patient_hash,
        snapshot_date=now,
        sat_patient_details_ldts=now,
        sat_medication_history_ldts=now,
        sat_document_content_ldts=now,
    )
    db.add(pit)
    await db.flush()


@router.get("/patient/{patient_id}/snapshot")
async def get_patient_snapshot(
    patient_id: str,
    as_of: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reconstruct patient state at a given point in time using PIT table.
    Temporal query — the core Data Vault 2.0 feature.
    """
    # Access control
    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    hash_key = make_hash(patient_id)

    # Parse as_of date
    if as_of:
        try:
            as_of_dt = datetime.strptime(as_of, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    else:
        as_of_dt = datetime.utcnow()

    # Find the closest PIT snapshot at or before as_of_dt
    result = await db.execute(
        select(PITPatientSnapshot)
        .where(PITPatientSnapshot.patient_hash == hash_key)
        .where(PITPatientSnapshot.snapshot_date <= as_of_dt)
        .order_by(PITPatientSnapshot.snapshot_date.desc())
        .limit(1)
    )
    pit = result.scalar_one_or_none()

    if not pit:
        return {
            "patient_id": patient_id,
            "as_of": as_of or "now",
            "snapshot": None,
            "message": "No historical snapshot found for this patient before the given date.",
        }

    # Fetch patient details at that point in time
    details_result = await db.execute(
        select(SatPatientDetails)
        .where(SatPatientDetails.patient_hash == hash_key)
        .where(SatPatientDetails.load_date <= pit.sat_patient_details_ldts)
        .where(
            (SatPatientDetails.load_end_date == None) |
            (SatPatientDetails.load_end_date > pit.sat_patient_details_ldts)
        )
        .order_by(SatPatientDetails.load_date.desc())
        .limit(1)
    )
    details = details_result.scalar_one_or_none()

    # Fetch medication history at that point
    meds_result = await db.execute(
        select(SatMedicationHistory)
        .where(SatMedicationHistory.patient_hash == hash_key)
        .where(SatMedicationHistory.load_date <= pit.sat_medication_history_ldts)
        .order_by(SatMedicationHistory.load_date.desc())
        .limit(20)
    )
    meds = meds_result.scalars().all()

    return {
        "patient_id": patient_id,
        "as_of": as_of_dt.isoformat(),
        "snapshot_date": pit.snapshot_date.isoformat(),
        "patient_details": {
            "name": details.name if details else None,
            "dob": str(details.dob) if details and details.dob else None,
            "phone": details.phone if details else None,
        },
        "medications_at_time": [
            {
                "dosage": m.dosage,
                "frequency": m.frequency,
                "prescribed_by": m.prescribed_by,
                "as_of": m.load_date.isoformat(),
            }
            for m in meds
        ],
    }
