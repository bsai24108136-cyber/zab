"""
MediTrace — Health Agent
Generates 4 personalised health plans (diet, exercise, sleep, lifestyle)
from a patient's live DB data.

Models used:
  summarize task → Gemini 2.5 Flash  (long JSON output)
  download task  → Gemini 2.5 Flash  (same)

No Claude. No OpenAI.
"""
import json
import logging
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import User, MedicalRecord, Prescription, LabReport
from ai.router import call_ai

logger = logging.getLogger(__name__)


# ── prompt template ───────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a certified health coach and medical nutritionist. "
    "Create safe, realistic, personalized plans based on the "
    "patient's actual medical conditions and medications. "
    "Never recommend anything that conflicts with their conditions. "
    "Keep language simple — patient is not a medical professional. "
    "Return ONLY valid JSON, no markdown, no explanation outside JSON."
)

_PROMPT_TEMPLATE = """{context}

Generate a personalized health plan as a JSON object with exactly
these 4 keys. Each key contains an array of items.

Return ONLY this JSON structure, nothing else:

{{
  "diet": {{
    "title": "Your Personalized Diet Plan",
    "condition_note": "Tailored for [condition]",
    "meals": [
      {{"time": "Breakfast", "foods": ["item1","item2"], "avoid": ["item1"]}},
      {{"time": "Lunch",     "foods": ["item1","item2"], "avoid": ["item1"]}},
      {{"time": "Dinner",    "foods": ["item1","item2"], "avoid": ["item1"]}},
      {{"time": "Snacks",    "foods": ["item1","item2"], "avoid": ["item1"]}}
    ],
    "tips": ["tip1", "tip2", "tip3"]
  }},
  "exercise": {{
    "title": "Your Exercise Routine",
    "condition_note": "Safe for [condition]",
    "weekly_plan": [
      {{"day": "Monday",    "activity": "30 min walk", "intensity": "low"}},
      {{"day": "Tuesday",   "activity": "Rest",         "intensity": "none"}},
      {{"day": "Wednesday", "activity": "Stretching",   "intensity": "low"}},
      {{"day": "Thursday",  "activity": "30 min walk",  "intensity": "low"}},
      {{"day": "Friday",    "activity": "Yoga 20 min",  "intensity": "low"}},
      {{"day": "Saturday",  "activity": "Light swim",   "intensity": "medium"}},
      {{"day": "Sunday",    "activity": "Rest",          "intensity": "none"}}
    ],
    "avoid": ["activity to avoid"],
    "tips": ["tip1", "tip2"]
  }},
  "sleep": {{
    "title": "Your Sleep Schedule",
    "condition_note": "Optimized for [condition]",
    "schedule": {{
      "bedtime": "10:30 PM",
      "wake_time": "6:30 AM",
      "duration_hours": 8,
      "nap": "20 min after lunch if needed"
    }},
    "habits": ["habit1", "habit2", "habit3"],
    "avoid": ["avoid1", "avoid2"]
  }},
  "lifestyle": {{
    "title": "Lifestyle Recommendations",
    "condition_note": "Based on your health profile",
    "recommendations": [
      {{"category": "Stress",     "advice": "..."}},
      {{"category": "Hydration",  "advice": "..."}},
      {{"category": "Monitoring", "advice": "..."}},
      {{"category": "Social",     "advice": "..."}},
      {{"category": "Habits",     "advice": "..."}}
    ],
    "warning": "Consult your doctor before making major changes."
  }}
}}
"""


def _build_context(user: User, records, prescriptions, labs) -> str:
    """Build the plain-text patient context string for the AI prompt."""
    conditions = " | ".join(
        r.diagnosis for r in records if r.diagnosis
    ) or "No diagnosis recorded"

    meds = " | ".join(
        f"{p.medicine_name} {p.dosage or ''}".strip() for p in prescriptions
    ) or "No active medications"

    lab_notes = " | ".join(
        l.doctor_note for l in labs if l.doctor_note
    ) or "No lab notes"

    # Age from full_name is not possible — User has no DOB.
    # We store age as unknown unless the user has a note in their record.
    name = user.full_name or "Unknown"

    return f"""
Patient profile:
- Name: {name}
- Gender: Unknown
- Blood group: Unknown
- Active conditions: {conditions}
- Current medications: {meds}
- Recent lab notes: {lab_notes}
"""


def _parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON safely."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        # parts[1] is the code block content
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


async def generate_health_plans(patient_id: str, db: AsyncSession) -> dict:
    """
    Read a patient's real data from DB and ask Gemini 2.5 Flash
    to generate 4 personalised health plans in one call.

    Returns:
        {
            "plans":        { diet, exercise, sleep, lifestyle },
            "model":        "Gemini 2.5 Flash",
            "patient_name": str,
            "based_on":     str,   # condition names
        }
    """
    # ── 1. Load patient ───────────────────────────────────────────────────────
    user_row = (await db.execute(
        select(User).where(User.id == patient_id)
    )).scalar_one_or_none()

    if not user_row:
        return {"error": "Patient not found"}

    # ── 2. Load clinical data ─────────────────────────────────────────────────
    records = (await db.execute(
        select(MedicalRecord)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.visit_date.desc())
        .limit(10)
    )).scalars().all()

    prescriptions = (await db.execute(
        select(Prescription)
        .where(
            Prescription.patient_id == patient_id,
            Prescription.status == "active",
        )
    )).scalars().all()

    labs = (await db.execute(
        select(LabReport)
        .where(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at.desc())
        .limit(5)
    )).scalars().all()

    # ── 3. Build context and prompt ───────────────────────────────────────────
    context = _build_context(user_row, records, prescriptions, labs)
    prompt = _PROMPT_TEMPLATE.format(context=context)

    conditions = " | ".join(
        r.diagnosis for r in records if r.diagnosis
    ) or "No diagnosis recorded"

    # ── 4. Call Gemini (summarize task → Gemini 2.5 Flash) ───────────────────
    result = await call_ai("summarize", prompt, _SYSTEM)

    # ── 5. Parse JSON ─────────────────────────────────────────────────────────
    try:
        plans = _parse_json(result["text"])
    except Exception as e:
        logger.error(f"[HealthAgent] JSON parse error: {e}\nRaw: {result['text'][:200]}")
        plans = {
            "error": f"Could not parse plans: {str(e)}",
            "raw": result["text"],
        }

    return {
        "plans":        plans,
        "model":        result.get("model", "Gemini 2.5 Flash"),
        "patient_name": user_row.full_name or "Patient",
        "based_on":     conditions,
    }


# ── PDF generation (used by download endpoint) ────────────────────────────────

def build_health_plan_pdf(data: dict, patient_name: str) -> bytes:
    """
    Build a PDF from already-generated plans dict.
    Uses reportlab. Returns raw bytes.
    """
    from io import BytesIO
    from datetime import datetime as _dt

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
    )

    plans = data.get("plans", {})
    model = data.get("model", "Gemini 2.5 Flash")

    def _style(name, **kw):
        base = getSampleStyleSheet()["Normal"].clone(name)
        for k, v in kw.items():
            setattr(base, k, v)
        return base

    title_s = _style("T",  fontSize=18, fontName="Helvetica-Bold",
                     textColor=colors.HexColor("#0E9F6E"), spaceAfter=4)
    meta_s  = _style("M",  fontSize=9,  textColor=colors.gray,            spaceAfter=20)
    sect_s  = _style("S",  fontSize=13, fontName="Helvetica-Bold",
                     textColor=colors.HexColor("#1A2B4A"),                 spaceAfter=6,  spaceBefore=16)
    sub_s   = _style("SB", fontSize=10, fontName="Helvetica-Bold",
                     textColor=colors.HexColor("#0E9F6E"),                 spaceAfter=3,  spaceBefore=8)
    body_s  = _style("B",  fontSize=10, leading=16,                       spaceAfter=3)
    warn_s  = _style("W",  fontSize=9,  textColor=colors.HexColor("#B45309"), spaceAfter=4)
    foot_s  = _style("F",  fontSize=8,  textColor=colors.gray)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=48, bottomMargin=48, leftMargin=56, rightMargin=56,
    )

    story = []
    story.append(Paragraph("MediTrace — Your Personal Health Plan", title_s))
    story.append(Paragraph(
        f"Prepared for: {patient_name}  |  "
        f"Generated: {_dt.now().strftime('%d %b %Y')}  |  "
        f"AI: {model}",
        meta_s,
    ))
    story.append(HRFlowable(
        width="100%", thickness=0.5,
        color=colors.HexColor("#86EFAC"), spaceAfter=12,
    ))

    # ── Diet ──────────────────────────────────────────────────────────────────
    diet = plans.get("diet", {})
    story.append(Paragraph("Diet Plan", sect_s))
    story.append(Paragraph(diet.get("condition_note", ""), body_s))
    for meal in diet.get("meals", []):
        story.append(Paragraph(meal.get("time", ""), sub_s))
        foods = meal.get("foods", [])
        if foods:
            story.append(Paragraph("Eat: " + ", ".join(foods), body_s))
        avoid = meal.get("avoid", [])
        if avoid:
            story.append(Paragraph("Avoid: " + ", ".join(avoid), body_s))
    for i, tip in enumerate(diet.get("tips", []), 1):
        story.append(Paragraph(f"{i}. {tip}", body_s))

    story.append(HRFlowable(width="100%", thickness=0.3,
                             color=colors.HexColor("#DDE8F5"), spaceAfter=4))

    # ── Exercise ──────────────────────────────────────────────────────────────
    ex = plans.get("exercise", {})
    story.append(Paragraph("Exercise Routine", sect_s))
    story.append(Paragraph(ex.get("condition_note", ""), body_s))
    for day in ex.get("weekly_plan", []):
        story.append(Paragraph(
            f"{day.get('day','')}: {day.get('activity','')} ({day.get('intensity','')})",
            body_s,
        ))
    if ex.get("avoid"):
        story.append(Paragraph("Avoid: " + ", ".join(ex["avoid"]), body_s))
    for i, tip in enumerate(ex.get("tips", []), 1):
        story.append(Paragraph(f"{i}. {tip}", body_s))

    story.append(HRFlowable(width="100%", thickness=0.3,
                             color=colors.HexColor("#DDE8F5"), spaceAfter=4))

    # ── Sleep ─────────────────────────────────────────────────────────────────
    sl = plans.get("sleep", {})
    sc = sl.get("schedule", {})
    story.append(Paragraph("Sleep Schedule", sect_s))
    story.append(Paragraph(sl.get("condition_note", ""), body_s))
    story.append(Paragraph(
        f"Bedtime: {sc.get('bedtime','')}  →  "
        f"Wake: {sc.get('wake_time','')}  "
        f"({sc.get('duration_hours','')} hours)",
        body_s,
    ))
    if sc.get("nap"):
        story.append(Paragraph(f"Nap: {sc['nap']}", body_s))
    for h in sl.get("habits", []):
        story.append(Paragraph(f"✓ {h}", body_s))
    for a in sl.get("avoid", []):
        story.append(Paragraph(f"✗ {a}", body_s))

    story.append(HRFlowable(width="100%", thickness=0.3,
                             color=colors.HexColor("#DDE8F5"), spaceAfter=4))

    # ── Lifestyle ─────────────────────────────────────────────────────────────
    ls = plans.get("lifestyle", {})
    story.append(Paragraph("Lifestyle Recommendations", sect_s))
    story.append(Paragraph(ls.get("condition_note", ""), body_s))
    for rec in ls.get("recommendations", []):
        story.append(Paragraph(
            f"{rec.get('category','')}: {rec.get('advice','')}", body_s,
        ))
    if ls.get("warning"):
        story.append(Spacer(1, 8))
        story.append(Paragraph(f"⚠ {ls['warning']}", warn_s))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.3,
                             color=colors.HexColor("#DDE8F5")))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Generated by MediTrace AI. This is a general wellness guide — "
        "not a medical prescription. Always consult your doctor.",
        foot_s,
    ))

    doc.build(story)
    return buf.getvalue()
