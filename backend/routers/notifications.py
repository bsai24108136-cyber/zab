"""
MediTrace — Notifications Router
GET   /notifications/              → list unread notifications for current doctor
PATCH /notifications/{id}/read     → mark one notification as read
PATCH /notifications/read-all      → mark all as read
"""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from auth import require_role
from database import get_db
from models import User, Notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _time_ago(dt: datetime) -> str:
    if not dt:
        return ""
    diff = datetime.utcnow() - dt
    if diff.seconds < 60:
        return "just now"
    if diff.seconds < 3600:
        return f"{diff.seconds // 60}m ago"
    if diff.days == 0:
        return f"{diff.seconds // 3600}h ago"
    return f"{diff.days}d ago"


@router.get("/")
async def list_notifications(
    include_read: bool = False,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """List notifications for the current doctor (unread by default)."""
    stmt = select(Notification).where(Notification.doctor_id == doctor.id)
    if not include_read:
        stmt = stmt.where(Notification.is_read == False)
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)

    result = await db.execute(stmt)
    notifs = result.scalars().all()

    # Fetch patient names
    patient_ids = list({n.patient_id for n in notifs if n.patient_id})
    patient_names: dict[str, str] = {}
    if patient_ids:
        p_result = await db.execute(
            select(User).where(User.id.in_(patient_ids))
        )
        for p in p_result.scalars().all():
            patient_names[p.id] = p.full_name or p.email or "Unknown"

    return {
        "notifications": [
            {
                "id": n.id,
                "severity": n.severity,
                "title": n.title,
                "message": n.message,
                "is_read": n.is_read,
                "patient_id": n.patient_id,
                "patient_name": patient_names.get(n.patient_id, "Unknown Patient"),
                "lab_report_id": n.lab_report_id,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "time_ago": _time_ago(n.created_at),
            }
            for n in notifs
        ],
        "unread_count": sum(1 for n in notifs if not n.is_read),
        "critical_count": sum(1 for n in notifs if not n.is_read and n.severity == "critical"),
        "urgent_count": sum(1 for n in notifs if not n.is_read and n.severity == "urgent"),
    }


@router.patch("/{notif_id}/read")
async def mark_read(
    notif_id: str,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.doctor_id == doctor.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    return {"message": "Marked as read"}


@router.patch("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_role("doctor", "admin")),
):
    """Mark all unread notifications as read for current doctor."""
    await db.execute(
        update(Notification)
        .where(Notification.doctor_id == doctor.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "All notifications marked as read"}
