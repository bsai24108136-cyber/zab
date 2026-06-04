# MediTrace Sample Test Data — Usage Guide
# ==========================================
# 3 patients covering the full risk spectrum.
# Each has a .txt medical document + a .csv lab report.
# Use these to test the full Agentic AI pipeline.

# ─────────────────────────────────────────────────────────────
# PATIENT 1 — LOW RISK
# ─────────────────────────────────────────────────────────────
# Name  : Sarah Ahmed  |  ID: PT-LOW-001  |  Age: 34F
# Risk  : LOW — mild iron deficiency, borderline Vitamin D
# Files :
#   patient1_low_risk_sarah_medical.txt  → Upload as "Document"
#   patient1_low_risk_sarah_labs.csv     → Upload as "Lab Report"
#
# EXPECTED AI BEHAVIOUR:
#   Clinical Summary  → Mostly normal. Flagged: borderline Hb, low ferritin
#   Autonomous Alert  → Low severity. Iron supplement recommendation.
#                       No critical notifications.
#   Drug Checker      → Add "Ferrous Sulphate" → SAFE (no interactions)
#                       Add "Ciprofloxacin"    → CAUTION (reduced absorption
#                                               with antacids — check timing)
#   Progress Report   → Short, positive. Improving health trend.
#   Timeline          → Blood Sugar: 88. BMI: 22. No alarming trends.
#
# HOW TO TEST:
#   1. Login as Doctor → Go to Patient "Sarah Ahmed"
#   2. Upload patient1_low_risk_sarah_medical.txt as Document
#   3. Upload patient1_low_risk_sarah_labs.csv   as Lab Report
#   4. Click "AI Analysis" tab → Ask: "What are Sarah's risk factors?"
#   5. Click "Timeline" tab → observe flat, stable trends
#   6. Click "Progress Report" → 30 days → Download PDF
#   7. Add prescription "Ibuprofen" → should show CAUTION (iron + NSAID)

# ─────────────────────────────────────────────────────────────
# PATIENT 2 — NORMAL / STABLE RISK
# ─────────────────────────────────────────────────────────────
# Name  : Ali Hassan  |  ID: PT-NRM-002  |  Age: 46M
# Risk  : MODERATE (managed) — T2DM + HTN + dyslipidaemia, controlled
# Files :
#   patient2_normal_risk_ali_medical.txt  → Upload as "Document"
#   patient2_normal_risk_ali_labs.csv     → Upload as "Lab Report"
#
# EXPECTED AI BEHAVIOUR:
#   Clinical Summary  → Positive trend. HbA1c improving. Mildly elevated ALT.
#                       CKD Stage 2 noted. Microalbuminuria flagged.
#   Autonomous Alert  → MODERATE. ALT elevated (statin watch).
#                       CKD progression risk. No critical alerts.
#   Drug Checker      →
#     Add "Aspirin 75mg"   → CAUTION (Aspirin + Warfarin if on warfarin)
#                            SAFE if not on warfarin
#     Add "Ibuprofen"      → CAUTION (NSAID + CKD + Metformin interaction)
#     Add "Metformin"      → SAFE (already on it — system checks new drug)
#     Add "Ciprofloxacin"  → SAFE (for Ali — no active warfarin)
#   Progress Report   → 90-day view → Shows HbA1c trending DOWN (good).
#                       ALT trending UP (concern flagged by Gemini).
#   Timeline          → Plot Blood Sugar, HbA1c, LDL trending down.
#                       ALT trending slightly up.
#
# HOW TO TEST:
#   1. Login as Doctor → Go to Patient "Ali Hassan"
#   2. Upload patient2_normal_risk_ali_medical.txt as Document
#   3. Upload patient2_normal_risk_ali_labs.csv    as Lab Report
#   4. Click "AI Analysis" → Ask: "What drug interactions should I watch?"
#   5. Click "Timeline" → observe multiple metrics trending
#   6. Click "Progress Report" → compare 30-day vs 90-day view
#   7. Add prescription "Ibuprofen" → CAUTION (CKD + Metformin)
#   8. Add prescription "Warfarin"  → CAUTION (Aspirin already prescribed)

# ─────────────────────────────────────────────────────────────
# PATIENT 3 — HIGH / CRITICAL RISK  *** MOST IMPORTANT ***
# ─────────────────────────────────────────────────────────────
# Name  : Zainab Malik  |  ID: PT-HGH-003  |  Age: 69F
# Risk  : CRITICAL — AKI on CKD5, CHF, NSTEMI, Sepsis, severe DM
# Files :
#   patient3_high_risk_zainab_medical.txt  → Upload as "Document"
#   patient3_high_risk_zainab_labs.csv     → Upload as "Lab Report"
#
# EXPECTED AI BEHAVIOUR:
#   Clinical Summary  → CRITICAL flags on almost every section.
#                       Gemini identifies 8+ active critical conditions.
#                       Multi-organ failure pattern identified.
#   Autonomous Alert  → CRITICAL notifications triggered:
#                       - Creatinine 7.8 → AKI alert
#                       - Potassium 6.7  → Hyperkalemia STAT alert
#                       - Troponin 1.2   → Cardiac injury alert
#                       - BNP 4200       → Heart failure decompensation
#                       - Blood Sugar 428→ Hyperglycaemia crisis
#                       - INR 3.8        → Supratherapeutic anticoagulation
#   Drug Checker TEST THESE COMBINATIONS:
#     Add "Aspirin"    → DANGEROUS (Aspirin + Warfarin — hardcoded hit)
#     Add "Ibuprofen"  → DANGEROUS (lithium-like risk; CKD 5 → nephrotoxic)
#     Add "Gentamicin" → DANGEROUS (Furosemide + Gentamicin → ototoxicity)
#     Add "Metronidazole" → SAFE (no interaction with her active meds)
#     Add "Digoxin"    → CAUTION (electrolyte imbalance toxicity risk)
#   Progress Report   → 90-day view → Gemini should write alarming
#                       commentary about deteriorating trajectory.
#                       Creatinine rising, HbA1c worsening, BNP escalating.
#   Timeline          → Plot: Creatinine (rising 1.9→7.8), HbA1c (worsening
#                       8.4→11.8), Blood Sugar (rising), BNP (rising).
#                       All trends going wrong direction.
#
# HOW TO TEST — DANGEROUS INTERACTION FLOW:
#   1. Login as Doctor → Go to Patient "Zainab Malik"
#   2. Upload patient3_high_risk_zainab_medical.txt as Document
#   3. Upload patient3_high_risk_zainab_labs.csv    as Lab Report
#   4. AI Analysis → "What are the most dangerous drug interactions?"
#   5. Go to Prescriptions tab → "Add Prescription"
#   6. Type "Aspirin" in medicine field → Tab/blur out
#      EXPECT: Red DANGEROUS banner
#              "Aspirin + Warfarin: major bleeding risk"
#              CONFIRM override box appears
#   7. Type "Gentamicin" → blur
#      EXPECT: Red DANGEROUS — furosemide + gentamicin nephrotoxicity
#   8. Click "Progress Report" → 90 days
#      EXPECT: AI commentary describes deteriorating multi-organ failure
#   9. Timeline tab → observe ALL metrics trending dangerously upward
#  10. Check notification bell → should show multiple CRITICAL alerts

# ─────────────────────────────────────────────────────────────
# AGENTIC AI PIPELINE — WHAT THIS TESTS
# ─────────────────────────────────────────────────────────────
# Feature               Patient 1     Patient 2     Patient 3
# ─────────────────────────────────────────────────────────────
# Lab AI analysis       Low/Normal    Moderate      CRITICAL ×15
# Clinical Summary      Simple        Multi-cond.   Complex multi-organ
# Autonomous Alerts     None/Low      Moderate      HIGH × 8+ alerts
# Drug Interaction Check SAFE          CAUTION       DANGEROUS (hardcoded)
# Progress Report PDF   Simple        Detailed      Alarming commentary
# Timeline Chart        Stable flat   Improving     Worsening trend
# AI Chat               Simple Q&A    Moderate      Complex clinical
# ─────────────────────────────────────────────────────────────

# QUICK DRUG INTERACTION TEST TABLE
# (for running check-interaction endpoint directly)
#
# POST /doctor/patient/{id}/check-interaction
# { "new_drug": "Aspirin" }      → with Warfarin → DANGEROUS (instant)
# { "new_drug": "Flagyl" }       → with alcohol  → DANGEROUS (instant)  
# { "new_drug": "Loprin" }       → with Warfarin → DANGEROUS (Loprin=Aspirin)
# { "new_drug": "Brufen" }       → with Aspirin  → CAUTION  (Brufen=Ibuprofen)
# { "new_drug": "Panadol" }      → with Warfarin → CAUTION  (Panadol=Paracetamol)
# { "new_drug": "Gentamicin" }   → with Lasix    → DANGEROUS (Lasix=Furosemide)
# { "new_drug": "Tenormin" }     → with Isoptin  → DANGEROUS (Tenormin=Atenolol, Isoptin=Verapamil)
# { "new_drug": "Metronidazole"} → no interactions → Grok AI → SAFE
# { "new_drug": "Amoxicillin" }  → with Warfarin → CAUTION
