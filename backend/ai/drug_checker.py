"""
MediTrace — Drug Interaction Checker
Step 1: Instant hardcoded lookup (KNOWN_INTERACTIONS dict) — no API call.
Step 2: If not found, call Grok (fast_qa) for AI pharmacology check.

AI model: Grok via Groq (llama-3.3-70b-versatile) — fastest response.
No Claude. No OpenAI.
"""
import json
import time
import logging
from .router import call_ai

logger = logging.getLogger(__name__)


# ── Brand → Generic normalization map ────────────────────────────────────────
# Covers common Pakistani clinic brand names + international aliases.
BRAND_TO_GENERIC: dict[str, str] = {
    # Paracetamol variants
    "panadol":          "paracetamol",
    "panadol extra":    "paracetamol",
    "pcm":              "paracetamol",
    "calpol":           "paracetamol",
    "febrol":           "paracetamol",
    "tylenol":          "paracetamol",
    "acetaminophen":    "paracetamol",

    # Ibuprofen variants
    "brufen":           "ibuprofen",
    "brugesic":         "ibuprofen",
    "advil":            "ibuprofen",
    "nurofen":          "ibuprofen",
    "motrin":           "ibuprofen",

    # Aspirin variants
    "loprin":           "aspirin",
    "disprin":          "aspirin",
    "ecosprin":         "aspirin",
    "ascard":           "aspirin",
    "cardiopirin":      "aspirin",

    # Metronidazole variants
    "flagyl":           "metronidazole",
    "metrogyl":         "metronidazole",
    "fasigyn":          "tinidazole",

    # Amoxicillin / Augmentin
    "augmentin":        "amoxicillin",
    "amoxil":           "amoxicillin",
    "moxatag":          "amoxicillin",
    "clamoxyl":         "amoxicillin",

    # Mefenamic acid
    "ponstan":          "mefenamic acid",
    "ponstel":          "mefenamic acid",

    # Ciprofloxacin
    "ciproxin":         "ciprofloxacin",
    "cipro":            "ciprofloxacin",

    # Furosemide
    "lasix":            "furosemide",

    # Metformin
    "glucophage":       "metformin",
    "diabex":           "metformin",
    "metex":            "metformin",

    # Atenolol
    "tenormin":         "atenolol",

    # Verapamil
    "isoptin":          "verapamil",
    "calan":            "verapamil",

    # Warfarin
    "coumadin":         "warfarin",
    "marevan":          "warfarin",
    "jantoven":         "warfarin",

    # Lithium
    "priadel":          "lithium",
    "camcolit":         "lithium",
    "liskonum":         "lithium",

    # Gentamicin
    "garamycin":        "gentamicin",

    # Antacids
    "maalox":           "antacid",
    "gaviscon":         "antacid",
    "tums":             "antacid",
    "gelusil":          "antacid",
    "mylanta":          "antacid",

    # Alcohol (for completeness)
    "alcohol":          "alcohol",
    "ethanol":          "alcohol",
}


def normalize_drug_name(name: str) -> str:
    """
    Lowercase, strip whitespace + dosage suffixes, then apply brand→generic map.
    Examples:
        "Flagyl 500mg"  → "metronidazole"
        "Brufen"        → "ibuprofen"
        "Warfarin 5mg"  → "warfarin"
        "Lisinopril"    → "lisinopril"  (unknown brand → lowercase passthrough)
    """
    if not name:
        return ""
    # Strip dosage: "Flagyl 500mg" → "flagyl"
    base = name.strip().lower()
    # Remove trailing dose/unit  e.g. " 500mg", " 10 ml", " 75 mg"
    import re
    base = re.split(r"\s+\d", base)[0].strip()
    return BRAND_TO_GENERIC.get(base, base)


# ── Hardcoded known interactions ──────────────────────────────────────────────
# frozenset({drug_a_norm, drug_b_norm}) → {severity, reason, recommendation}
# severity: "DANGEROUS" | "CAUTION"
KNOWN_INTERACTIONS: dict[frozenset, dict] = {
    # ── DANGEROUS ─────────────────────────────────────────────────────────────
    frozenset({"aspirin", "warfarin"}): {
        "severity": "DANGEROUS",
        "reason": "Aspirin + Warfarin: major risk of serious bleeding (GI, intracranial). "
                  "Both inhibit clotting by different mechanisms.",
        "recommendation": "Avoid combination. If antiplatelet therapy is needed, "
                          "reassess warfarin dose under haematology supervision.",
    },
    frozenset({"metronidazole", "alcohol"}): {
        "severity": "DANGEROUS",
        "reason": "Metronidazole inhibits acetaldehyde dehydrogenase. Alcohol causes "
                  "severe disulfiram-like reaction: flushing, vomiting, tachycardia.",
        "recommendation": "Absolute contraindication. Patient must not consume alcohol "
                          "during and 48 hours after metronidazole course.",
    },
    frozenset({"atenolol", "verapamil"}): {
        "severity": "DANGEROUS",
        "reason": "Beta-blocker + calcium channel blocker (non-dihydropyridine): "
                  "additive negative chronotropic/inotropic effect. Risk of severe "
                  "bradycardia, heart block, and cardiac arrest.",
        "recommendation": "Avoid concurrent use. If necessary, use only under ECG "
                          "monitoring in hospital settings.",
    },
    frozenset({"furosemide", "gentamicin"}): {
        "severity": "DANGEROUS",
        "reason": "Loop diuretic + aminoglycoside: synergistic ototoxicity and "
                  "nephrotoxicity. Furosemide increases renal gentamicin retention.",
        "recommendation": "Avoid combination. If critical, monitor renal function and "
                          "audiometry. Adjust doses aggressively.",
    },
    frozenset({"lithium", "ibuprofen"}): {
        "severity": "DANGEROUS",
        "reason": "NSAIDs reduce renal lithium clearance, causing lithium toxicity "
                  "(tremor, seizures, cardiac arrhythmia) at previously safe doses.",
        "recommendation": "Contraindicated. Use paracetamol for analgesia instead. "
                          "Monitor lithium levels closely if unavoidable.",
    },
    frozenset({"lithium", "mefenamic acid"}): {
        "severity": "DANGEROUS",
        "reason": "Mefenamic acid (NSAID) reduces renal lithium clearance, "
                  "risking lithium toxicity.",
        "recommendation": "Avoid. Use paracetamol. Monitor lithium levels urgently.",
    },

    # ── CAUTION ───────────────────────────────────────────────────────────────
    frozenset({"paracetamol", "warfarin"}): {
        "severity": "CAUTION",
        "reason": "Regular paracetamol (>2g/day) potentiates warfarin anticoagulation, "
                  "raising INR and bleeding risk.",
        "recommendation": "Use lowest effective paracetamol dose (<2g/day). Monitor INR "
                          "weekly for first month, adjust warfarin as needed.",
    },
    frozenset({"ibuprofen", "aspirin"}): {
        "severity": "CAUTION",
        "reason": "Ibuprofen competitively inhibits COX-1, blocking aspirin's "
                  "irreversible platelet inhibition and reducing cardioprotection.",
        "recommendation": "Take aspirin 30 min before ibuprofen, or use paracetamol "
                          "instead of ibuprofen.",
    },
    frozenset({"metformin", "alcohol"}): {
        "severity": "CAUTION",
        "reason": "Alcohol + metformin increases risk of lactic acidosis, particularly "
                  "in patients with hepatic or renal impairment.",
        "recommendation": "Advise patient to limit alcohol strictly. Check renal and "
                          "hepatic function regularly.",
    },
    frozenset({"ciprofloxacin", "antacid"}): {
        "severity": "CAUTION",
        "reason": "Antacids containing Mg²⁺/Al³⁺ chelate ciprofloxacin in the gut, "
                  "reducing absorption by up to 90%.",
        "recommendation": "Separate doses by at least 2 hours. Take ciprofloxacin "
                          "first, antacid after.",
    },
    frozenset({"amoxicillin", "warfarin"}): {
        "severity": "CAUTION",
        "reason": "Amoxicillin alters gut flora, reducing Vitamin K synthesis and "
                  "potentiating warfarin's anticoagulant effect.",
        "recommendation": "Monitor INR closely during and 1 week after the antibiotic "
                          "course. Adjust warfarin dose if INR rises.",
    },
    frozenset({"mefenamic acid", "warfarin"}): {
        "severity": "CAUTION",
        "reason": "NSAIDs displace warfarin from plasma proteins and inhibit platelets, "
                  "significantly increasing bleeding risk.",
        "recommendation": "Avoid if possible. If required, reduce warfarin dose and "
                          "monitor INR every 2–3 days.",
    },
    frozenset({"ibuprofen", "warfarin"}): {
        "severity": "CAUTION",
        "reason": "Ibuprofen inhibits platelets and may displace warfarin from protein "
                  "binding, increasing anticoagulation and GI bleed risk.",
        "recommendation": "Avoid combination. Use paracetamol for analgesia.",
    },
    frozenset({"ciprofloxacin", "warfarin"}): {
        "severity": "CAUTION",
        "reason": "Ciprofloxacin inhibits CYP1A2, reducing warfarin metabolism and "
                  "significantly raising INR.",
        "recommendation": "Monitor INR every 2–3 days during course and reduce warfarin "
                          "dose by 20–30% empirically.",
    },
    frozenset({"metformin", "furosemide"}): {
        "severity": "CAUTION",
        "reason": "Furosemide can impair renal function; reduced GFR raises metformin "
                  "levels, increasing lactic acidosis risk.",
        "recommendation": "Check eGFR before starting furosemide. Hold metformin if "
                          "eGFR falls below 30 mL/min.",
    },
}


async def check_interactions(
    new_drug: str,
    active_medications: list[dict],   # [{"name": str, "dosage": str?, "frequency": str?}]
    patient_context: str = "",        # optional: "Age 65, Diabetes, CKD Stage 3"
) -> dict:
    """
    Check new_drug against all active_medications for interactions.

    Returns:
    {
        "verdict":                "SAFE" | "CAUTION" | "DANGEROUS",
        "new_drug":               str,
        "checked_against":        [str],
        "interactions":           [{drug_a, drug_b, severity, reason, recommendation}],
        "overall_recommendation": str,
        "model":                  str,
        "response_ms":            float,
    }
    """
    t0 = time.time()

    if not active_medications:
        return {
            "verdict":                "SAFE",
            "new_drug":               new_drug,
            "checked_against":        [],
            "interactions":           [],
            "overall_recommendation": "No active medications to check against.",
            "model":                  "no-check",
            "response_ms":            0.0,
        }

    new_norm   = normalize_drug_name(new_drug)
    active_norms = [normalize_drug_name(m.get("name", "")) for m in active_medications]

    # ── Step 1: Instant hardcoded lookup ─────────────────────────────────────
    hardcoded_hits: list[dict] = []

    for i, (med, med_norm) in enumerate(zip(active_medications, active_norms)):
        pair = frozenset({new_norm, med_norm})
        if pair in KNOWN_INTERACTIONS:
            entry = KNOWN_INTERACTIONS[pair]
            hardcoded_hits.append({
                "drug_a":          new_drug,
                "drug_b":          med.get("name", med_norm),
                "severity":        entry["severity"],
                "reason":          entry["reason"],
                "recommendation":  entry["recommendation"],
                "source":          "hardcoded",
            })

    if hardcoded_hits:
        # Determine worst verdict
        severities = [h["severity"] for h in hardcoded_hits]
        verdict = "DANGEROUS" if "DANGEROUS" in severities else "CAUTION"

        # Build summary
        worst = next(h for h in hardcoded_hits if h["severity"] == verdict)
        overall = worst["recommendation"]

        return {
            "verdict":                verdict,
            "new_drug":               new_drug,
            "checked_against":        [m.get("name", "") for m in active_medications],
            "interactions":           hardcoded_hits,
            "overall_recommendation": overall,
            "model":                  "hardcoded-lookup",
            "response_ms":            round((time.time() - t0) * 1000, 1),
        }

    # ── Step 2: AI check via Grok (fast_qa task) ─────────────────────────────
    med_list = ", ".join(
        f"{m.get('name','')} {m.get('dosage','') or ''}".strip()
        for m in active_medications
    )

    context_line = f"\nPatient context: {patient_context}" if patient_context else ""

    prompt = f"""New prescription: {new_drug}
Patient's current active medications: {med_list}{context_line}

Check for clinically significant drug interactions. Return ONLY valid JSON, no markdown:
{{
  "verdict": "SAFE" | "CAUTION" | "DANGEROUS",
  "interactions": [
    {{
      "drug_a": "exact drug name",
      "drug_b": "exact drug name",
      "severity": "CAUTION" | "DANGEROUS",
      "reason": "one concise clinical sentence explaining the mechanism",
      "recommendation": "specific action the prescribing doctor should take"
    }}
  ],
  "overall_recommendation": "one sentence summary for the prescribing doctor"
}}

If no interactions found, return: {{"verdict":"SAFE","interactions":[],"overall_recommendation":"No clinically significant interactions identified."}}
Return valid JSON only."""

    system = (
        "You are a senior clinical pharmacologist advising a prescribing doctor. "
        "Be precise, conservative, and evidence-based. "
        "When in doubt, flag as CAUTION rather than SAFE. "
        "Return ONLY the JSON object — no markdown, no explanation outside JSON."
    )

    try:
        result = await call_ai("fast_qa", prompt, system)
        raw = result["text"].strip()

        # Strip markdown fences if AI added them
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]

        parsed = json.loads(raw.strip())

        interactions = parsed.get("interactions", [])
        # Stamp source on each interaction
        for ix in interactions:
            ix["source"] = "grok-ai"

        return {
            "verdict":                parsed.get("verdict", "CAUTION"),
            "new_drug":               new_drug,
            "checked_against":        [m.get("name", "") for m in active_medications],
            "interactions":           interactions,
            "overall_recommendation": parsed.get("overall_recommendation", ""),
            "model":                  result.get("model", "Grok / Llama-3.3"),
            "response_ms":            round((time.time() - t0) * 1000, 1),
        }

    except Exception as e:
        logger.warning(f"[DrugChecker] AI parse error: {e}")
        return {
            "verdict":                "CAUTION",
            "new_drug":               new_drug,
            "checked_against":        [m.get("name", "") for m in active_medications],
            "interactions":           [],
            "overall_recommendation": (
                "Unable to verify interactions automatically. "
                "Please review the patient's medication list manually before prescribing."
            ),
            "model":                  "error",
            "response_ms":            round((time.time() - t0) * 1000, 1),
        }
