"""
MediTrace — Autonomous Clinical Workflow
Runs automatically as a background task on every lab upload.
Step 1: Grok extracts all lab values (fast).
Step 2: Each value checked against clinical normal ranges.
Step 3: Gemini writes the clinical alert message.
Step 4: Notification saved to DB + lab status updated.
"""
import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ai.router import call_ai, parse_json_safe

logger = logging.getLogger(__name__)

NORMAL_RANGES = {
    "potassium":  (3.5, 5.0),
    "sodium":     (136, 145),
    "glucose":    (70, 100),
    "creatinine": (0.6, 1.2),
    "hemoglobin": (12.0, 17.5),
    "hba1c":      (4.0, 5.6),
    "platelets":  (150, 400),
    "wbc":        (4.5, 11.0),
    "urea":       (7, 25),
    "bilirubin":  (0.1, 1.2),
}


async def run_autonomous_check(
    lab_report_id: str,
    patient_id: str,
    doctor_id: str,
    lab_text: str,
    db: AsyncSession,
):
    """Background task: analyse lab text and create notification if abnormal."""
    try:
        from models import Notification, LabReport

        # ── Step 1: Grok extracts numeric values ──────────────────────────────
        raw = await call_ai(
            "extract",
            f"Extract ALL lab test values from this report.\n"
            f"Return ONLY a JSON array, no text:\n"
            f'[{{"name":"Potassium","value":6.2,"unit":"mEq/L"}}]\n\n'
            f"Lab report:\n{lab_text}",
            "Return valid JSON array only. Nothing else.",
        )
        values = parse_json_safe(raw["text"])
        if not values:
            logger.info(f"[Autonomous] No values extracted for lab {lab_report_id}")
            return

        # ── Step 2: Check each against normal ranges ──────────────────────────
        abnormal = []
        for v in values:
            key = str(v.get("name", "")).lower().replace(" ", "")
            try:
                val = float(str(v.get("value", "0")).replace(",", ""))
            except (TypeError, ValueError):
                continue

            for metric, (lo, hi) in NORMAL_RANGES.items():
                if metric in key:
                    if val < lo or val > hi:
                        sev = (
                            "critical"
                            if val < lo * 0.75 or val > hi * 1.4
                            else "urgent"
                            if val < lo * 0.9 or val > hi * 1.2
                            else "routine"
                        )
                        abnormal.append(
                            {
                                "name": v["name"],
                                "value": val,
                                "unit": v.get("unit", ""),
                                "normal": f"{lo}–{hi}",
                                "severity": sev,
                            }
                        )

        if not abnormal:
            logger.info(f"[Autonomous] All values normal for lab {lab_report_id}")
            return

        top_sev = (
            "critical"
            if any(a["severity"] == "critical" for a in abnormal)
            else "urgent"
            if any(a["severity"] == "urgent" for a in abnormal)
            else "routine"
        )

        # ── Step 3: Gemini writes the clinical alert ──────────────────────────
        alert = await call_ai(
            "summarize",
            f"Abnormal lab values detected:\n{abnormal}\n\n"
            f"Write a brief clinical alert for the doctor (under 120 words):\n"
            f"- Each abnormal value with 2-3 possible causes\n"
            f"- Recommended immediate action\n"
            f"- Overall urgency: {top_sev}\n"
            f"Clinical tone. No fluff.",
            "You are a clinical decision support AI writing a doctor alert.",
        )

        # ── Step 4: Save notification ─────────────────────────────────────────
        notif = Notification(
            id=str(uuid.uuid4()),
            doctor_id=doctor_id,
            patient_id=patient_id,
            lab_report_id=lab_report_id,
            severity=top_sev,
            title=f"{len(abnormal)} abnormal value(s) — {top_sev.upper()}",
            message=alert["text"],
        )
        db.add(notif)

        # ── Step 5: Update lab status ─────────────────────────────────────────
        lab_result = await db.execute(
            select(LabReport).where(LabReport.id == lab_report_id)
        )
        lab = lab_result.scalar_one_or_none()
        if lab:
            lab.result_status = (
                "reviewed_critical" if top_sev == "critical" else "reviewed_abnormal"
            )

        await db.commit()
        logger.info(
            f"[Autonomous] Created {top_sev} notification for lab {lab_report_id}"
        )

    except Exception as e:
        logger.error(f"[Autonomous] Error processing lab {lab_report_id}: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
