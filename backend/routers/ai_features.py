"""
MediTrace — AI Feature Endpoints
GET  /ai/summary/{patient_id}               → clinical summary (cached)
GET  /ai/summary/{patient_id}/download      → PDF or TXT download
GET  /ai/temporal/{patient_id}              → timeline + trend analysis
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_role
from database import get_db
from models import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI Features"])


# ── Clinical Summary ───────────────────────────────────────────────────────────

@router.get("/ai/summary/{patient_id}")
async def get_clinical_summary(
    patient_id: str,
    refresh: bool = Query(False, description="Force regenerate, ignore cache"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns structured 6-section clinical summary for a patient.
    Cached for 1 hour. Pass ?refresh=true to force regeneration.
    """
    from ai.summary import generate_clinical_summary, invalidate_cache

    # Patients can only see their own summary
    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if refresh:
        invalidate_cache(patient_id)

    result = await generate_clinical_summary(patient_id, db)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/ai/summary/{patient_id}/download")
async def download_summary(
    patient_id: str,
    format: str = Query("pdf", description="pdf or txt"),
    audience: str = Query("doctor", description="doctor or patient"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download clinical summary as PDF or TXT."""
    from ai.summary import generate_clinical_summary
    from ai.export import generate_pdf, generate_txt
    from models import User as UserModel
    from sqlalchemy import select

    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get patient info
    result = await db.execute(
        select(UserModel).where(UserModel.id == patient_id)
    )
    patient_obj = result.scalar_one_or_none()
    if not patient_obj:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient_dict = {
        "first_name": (patient_obj.full_name or "").split(" ")[0],
        "last_name": " ".join((patient_obj.full_name or "").split(" ")[1:]),
        "patient_id": patient_obj.id[:8].upper(),
    }

    summary_data = await generate_clinical_summary(patient_id, db)
    if "error" in summary_data:
        raise HTTPException(status_code=404, detail=summary_data["error"])

    summary_dict = {**summary_data.get("summary", {}), "model": summary_data.get("model", "AI")}
    pid_short = patient_obj.id[:8].upper()

    if format == "txt":
        content = generate_txt(patient_dict, summary_dict).encode("utf-8")
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="MediTrace_{pid_short}.txt"'},
        )
    else:
        try:
            content = generate_pdf(patient_dict, summary_dict, audience)
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="MediTrace_{pid_short}.pdf"'},
        )


# ── Temporal Intelligence ──────────────────────────────────────────────────────

@router.get("/ai/temporal/{patient_id}")
async def get_temporal_analysis(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Timeline + trend analysis for a patient (Grok extract → Gemini analyze)."""
    from ai.temporal import build_patient_timeline

    if current_user.role == "patient" and current_user.id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await build_patient_timeline(patient_id, db)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
