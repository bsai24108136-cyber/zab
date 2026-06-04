"""
MediTrace — Temporal Patient Intelligence
Sources:
  1. LabReport.lab_values  → already structured numeric data (primary source)
  2. MedicalRecord notes   → regex extraction first, Grok AI fallback if needed
Step 2: Gemini analyzes the full multi-source timeline for trends.
"""
import json
import re
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ai.router import call_ai, parse_json_safe

logger = logging.getLogger(__name__)

NORMAL_RANGES = {
    "glucose":      (70,  100),
    "blood sugar":  (70,  100),
    "sugar":        (70,  100),
    "rbs":          (70,  140),
    "fbs":          (70,  100),
    "hba1c":        (4.0,  5.6),
    "potassium":    (3.5,  5.0),
    "sodium":       (136, 145),
    "creatinine":   (0.6,  1.2),
    "hemoglobin":   (12.0, 17.5),
    "haemoglobin":  (12.0, 17.5),
    "hb":           (12.0, 17.5),
    "weight":       (0,   9999),
    "bmi":          (18.5, 24.9),
    "cholesterol":  (0,   200),
    "ldl":          (0,   130),
    "hdl":          (40,  9999),
    "triglyceride": (0,   150),
    "alt":          (0,   40),
    "ast":          (0,   40),
    "egfr":         (60,  9999),
    "urea":         (7,   25),
    "bun":          (7,   25),
    "troponin":     (0,   0.04),
    "bnp":          (0,   100),
}

# ── Regex: extract "Metric 123.4 unit" or "Metric: 123.4 unit" ────────────────
_NUM_PAT = re.compile(
    r"([A-Za-z][A-Za-z0-9 /()%\-]{1,40}?)"   # metric name
    r"[\s:=\-]+"                               # separator
    r"(\d{1,6}(?:\.\d{1,3})?)"                # numeric value
    r"(?:\s*([A-Za-z/%µ][A-Za-z0-9/µ%]*))?"   # optional unit
    , re.IGNORECASE,
)

# Tokens that are clearly NOT metric names (stop false positives)
_STOP_WORDS = {
    "visit", "patient", "doctor", "diagnosis", "note", "date", "age",
    "day", "days", "week", "weeks", "month", "months", "year", "years",
    "mg", "ml", "iv", "bd", "od", "tds", "qid", "prn", "hs",
    "admitted", "advised", "prescribed", "referred", "review",
}


def _regex_extract(text: str) -> list[dict]:
    """Fast local extraction — no API call needed."""
    results = []
    seen: set[str] = set()
    for m in _NUM_PAT.finditer(text):
        name = m.group(1).strip().rstrip(" :-")
        val  = float(m.group(2))
        unit = (m.group(3) or "").strip()

        name_lower = name.lower()
        if name_lower in _STOP_WORDS or len(name) < 3:
            continue
        if val == 0:
            continue

        key = name_lower
        if key in seen:
            continue
        seen.add(key)
        results.append({"metric": name, "value": val, "unit": unit})
    return results


async def build_patient_timeline(patient_id: str, db: AsyncSession) -> dict:
    from models import MedicalRecord, LabReport, LabValue, Document

    # ── Fetch medical records ─────────────────────────────────────────────────
    records_result = await db.execute(
        select(MedicalRecord)
        .where(MedicalRecord.patient_id == patient_id)
        .order_by(MedicalRecord.visit_date)
    )
    records = records_result.scalars().all()

    # ── Fetch lab reports WITH their lab_values eagerly loaded ────────────────
    labs_result = await db.execute(
        select(LabReport)
        .options(selectinload(LabReport.lab_values))
        .where(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at)
    )
    labs = labs_result.scalars().all()

    # ── Fetch uploaded documents for this patient ─────────────────────────────
    docs_result = await db.execute(
        select(Document)
        .where(Document.patient_id == patient_id)
        .where(Document.status == "ready")
        .order_by(Document.upload_date)
    )
    documents = docs_result.scalars().all()

    if not records and not labs and not documents:
        return {"error": "No records found for this patient"}

    timeline = []

    # ── Source 1: Lab report values (already structured — no AI needed) ───────
    for lab in labs:
        if not lab.lab_values:
            continue
        date_str = (
            str(lab.uploaded_at.date()) if lab.uploaded_at else "unknown"
        )
        values = []
        for lv in lab.lab_values:
            if lv.value is None:
                continue
            values.append({
                "metric": lv.test_name,
                "value":  lv.value,
                "unit":   lv.unit or "",
                "status": lv.status or "normal",
            })
        if values:
            timeline.append({
                "date":      date_str,
                "type":      "lab_report",
                "source_id": lab.id,
                "values":    values,
            })

    # ── Source 2: Medical record notes ────────────────────────────────────────
    for rec in records:
        text = " ".join(
            filter(None, [rec.symptoms, rec.diagnosis, rec.notes])
        ).strip()
        if not text:
            continue

        # Try fast regex first
        values = _regex_extract(text)

        # If regex found nothing, call Grok as fallback
        if not values:
            try:
                raw = await call_ai(
                    "extract",
                    f"Extract numeric health values from this clinical note.\n"
                    f"Return JSON array ONLY, no explanation:\n"
                    f'[{{"metric":"Blood Sugar","value":140,"unit":"mg/dL"}}]\n\n'
                    f"Note: {text}",
                    "Return valid JSON array only.",
                )
                values = parse_json_safe(raw["text"]) or []
            except Exception as e:
                logger.warning(f"Grok extract failed for record {rec.id}: {e}")
                values = []

        if values:
            timeline.append({
                "date":      str(rec.visit_date),
                "type":      "record",
                "source_id": rec.id,
                "values":    values,
            })

    # ── Source 3: Uploaded documents (e.g., lab reports, medical notes) ───────
    for doc in documents:
        if not doc.raw_text:
            continue

        date_str = (
            str(doc.upload_date.date()) if doc.upload_date else "unknown"
        )

        # Try fast regex first
        values = _regex_extract(doc.raw_text)

        # If regex found nothing, call AI as fallback
        if not values:
            try:
                raw = await call_ai(
                    "extract",
                    f"Extract numeric health values from this medical document.\n"
                    f"Return JSON array ONLY, no explanation:\n"
                    f'[{{"metric":"Blood Sugar","value":140,"unit":"mg/dL"}}]\n\n'
                    f"Document: {doc.raw_text[:2000]}",  # First 2000 chars to avoid token limit
                    "Return valid JSON array only.",
                )
                values = parse_json_safe(raw["text"]) or []
            except Exception as e:
                logger.warning(f"AI extract failed for document {doc.id}: {e}")
                values = []

        if values:
            timeline.append({
                "date":      date_str,
                "type":      "document",
                "source_id": doc.id,
                "filename":  doc.filename,
                "values":    values,
            })

    if not timeline:
        return {
            "error": (
                "No numeric values found. "
                "Upload medical documents (lab reports, health records), "
                "add lab report CSVs, or add visit notes with values "
                "(e.g. 'Blood Pressure: 130/85 mmHg, Weight: 72 kg')."
            )
        }

    # ── Step 2: Gemini analyzes the full timeline ─────────────────────────────
    analysis = await call_ai(
        "temporal",
        f"Patient health timeline:\n{json.dumps(timeline, indent=2)}\n\n"
        f"Analyze this patient's health progression:\n"
        f"1. Which metrics are WORSENING? (list with dates)\n"
        f"2. Which are IMPROVING?\n"
        f"3. Any URGENT concerns?\n"
        f"4. One sentence overall health trajectory.\n"
        f"Be specific — mention exact values and dates.",
        "You are a senior clinician analyzing longitudinal patient data. "
        "Be concise and clinically accurate.",
    )

    # ── Step 3: Per-metric trend calculation ─────────────────────────────────
    metric_series: dict[str, list] = {}
    for entry in timeline:
        for v in entry.get("values", []):
            key = str(v.get("metric", "")).strip().lower()
            if not key:
                continue
            metric_series.setdefault(key, [])
            try:
                metric_series[key].append(
                    {"date": entry["date"], "value": float(v["value"])}
                )
            except (TypeError, ValueError):
                pass

    trends: dict[str, dict] = {}
    for metric, readings in metric_series.items():
        if len(readings) >= 2:
            first = readings[0]["value"]
            last  = readings[-1]["value"]
            change = ((last - first) / first) * 100 if first != 0 else 0
            trends[metric] = {
                "direction": (
                    "increasing" if change > 5
                    else "decreasing" if change < -5
                    else "stable"
                ),
                "change_pct": round(change, 1),
                "readings":   readings,
            }

    # ── Step 4: Overall risk level ────────────────────────────────────────────
    risk = "stable"
    for m, t in trends.items():
        for rng_key, (lo, hi) in NORMAL_RANGES.items():
            if rng_key in m:
                last_val = t["readings"][-1]["value"]
                if last_val > hi * 1.5 or last_val < lo * 0.6:
                    risk = "critical"
                elif t["direction"] == "increasing" and last_val > hi and risk != "critical":
                    risk = "worsening"

    return {
        "timeline":     timeline,
        "trends":       trends,
        "ai_analysis":  analysis["text"],
        "model":        analysis["model"],
        "risk_level":   risk,
        "metric_count": len(trends),
    }
