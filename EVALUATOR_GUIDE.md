# MediTrace — Evaluator Demo Guide
# Team: Shiv Kumar, Usama Shehzad, Mariyam, Bhumika, Husna

---

## Before You Start

Open two browser tabs:
- **Frontend:** http://localhost:3000 (or live Vercel URL)
- **API Docs:** http://localhost:8000/docs (or live Railway URL)

All three scenarios below are designed to hit every mark the rubric checks.

---

## Scenario 1 — Patient Chat with Gemini 1.5 Flash
**Marks tested:** Auth, RBAC, Patient AI, Agentic AI, Citations, Technical Quality

### Steps

1. Go to **http://localhost:3000**
2. In the "Quick Demo Login" section, click **Patient** to auto-fill credentials
3. Click **Sign In**
   - You are now in the **Patient Portal** (role-locked — cannot access doctor or admin routes)
4. Click **AI Chat** in the sidebar

### Test Query 1 — Symptom Triage
```
Type: "I have a headache and slight fever since 2 days"
Press Enter
```

**What to observe:**
- ✅ Agent step indicators appear in real time:
  - "Analyzing your question…"
  - "Analyzing symptoms…"
  - "Generating your answer…"
- ✅ Response appears with:
  - **Urgency badge** — GREEN (low) — "Rest at home, fluids, Paracetamol if needed"
  - **Tool chips** — `[triage_symptoms]`
  - **Model badge** — `Gemini 1.5 Flash`
  - **Disclaimer** — "Not medical advice. Always consult your doctor."

### Test Query 2 — Medication Check
```
Type: "What medications am I currently on?"
Press Enter
```

**What to observe:**
- ✅ Agent calls `get_my_medications` tool
- ✅ Lists active prescriptions from database with refill dates
- ✅ Citation: "According to your records…"
- ✅ Model badge `Gemini 1.5 Flash` visible on every response

### Bonus — Emergency Triage
```
Type: "I have severe chest pain and can't breathe"
```
- ✅ Urgency badge turns RED (emergency)
- ✅ Response includes: "This sounds serious — please go to emergency immediately or call 1122"

---

## Scenario 2 — Doctor Predictions with GPT-4o-mini
**Marks tested:** Doctor AI, Agentic AI, Citations with source + chunk number, Dashboard completeness

### Steps

1. Log out, then click **Doctor** in Quick Demo Login
2. Click **Sign In** → redirected to **Doctor Portal**
3. Click **AI Assistant** in the sidebar

### Test — Pharmacy & Adherence Tab
1. Click the **Pharmacy** tab
2. Enter Patient ID: *(copy from the Patients page, or use the default seeded patient ID)*
3. Click **Run Agent**

**What to observe:**
- ✅ Live step indicators:
  - "Fetching patient history…"
  - "Loading prescription history…"
  - "Calculating adherence…"
  - "Forecasting refills…"
- ✅ Result card shows:
  - Adherence score (e.g. `72%`)
  - Next refill forecast date
  - Risk level: Low / Medium / High
  - **Model badge:** `GPT-4o-mini`

### Test — Risk Forecast Tab
1. Click the **Risk Forecast** tab
2. Same patient ID
3. Click **Run Agent**

**What to observe:**
- ✅ 30-day readmission risk percentage with confidence range
- ✅ Disease progression flags
- ✅ Recommended investigations
- ✅ Citations: "Source: [document.pdf] · Chunk [N] · Uploaded [date] · Confidence: [%]"
- ✅ **Disclaimer** at bottom: "Clinical AI output — final decision rests with the clinician."

---

## Scenario 3 — Agentic Contraindication Check (Most Important)
**Marks tested:** Agentic AI (3 marks) — agent steps MUST be visible

### Steps

1. Stay as Doctor → **AI Assistant** → click **Interactions** tab
2. Enter Patient ID (same as above)
3. In "Drug Name" field, type: `Loprin`
4. Click **Run Agent**

**What evaluators see (this is the 3-mark demo):**

```
Step 1: [✓] Analyzing query...
Step 2: [⟳] Fetching patient history...   ← [get_patient_history] tool chip
Step 3: [⟳] Normalizing drug name...      ← [normalize_drug_name] tool chip  
Step 4: [⟳] Checking contradictions...    ← [check_drug_contradictions] tool chip
Step 5: [✓] Generating clinical summary...
```

**Final output:**
- ✅ **Tool chips displayed:** `[get_patient_history]` `[normalize_drug_name]` `[check_drug_contradictions]`
- ✅ Drug normalized: **Loprin → Aspirin** (from Pakistani drug alias dictionary)
- ✅ Result card: `⚠ WARNING` or `✓ SAFE` with full reasoning
- ✅ "How I reached this conclusion" collapsible reasoning trace
- ✅ **Model badge:** `GPT-4o-mini` prominently displayed
- ✅ Source citation with document name, chunk number, upload date, confidence %
- ✅ **Disclaimer:** "Clinical AI output — final decision rests with the clinician."

---

## Dashboard Completeness Check (1 mark)

The evaluator should click through these 4 sections and verify they work:

| Section | Where to find it |
|---------|-----------------|
| **File Manager** | Patient → My Documents OR Doctor → Documents |
| **Analytics Charts** | Doctor → Analytics (3 Recharts graphs) |
| **Search History + Ratings** | Patient/Doctor → Search → History tab |
| **Performance Metrics** | Admin → Cost Monitor |

---

## Additional Features to Show

| Feature | Location |
|---------|----------|
| Multi-format upload (PDF/DOCX/TXT/CSV) | Any Documents page → drag & drop |
| Embedding status (chunk count) | Documents table → "Chunks" column |
| Semantic search with confidence % | Search page → type a query |
| Hybrid search match type badges | Search results → semantic/keyword/hybrid tags |
| Role isolation (RBAC) | Try accessing /dashboard/admin as patient → should redirect |
| Medication reminders banner | Patient dashboard → top of page if meds expiring |
| Data Vault snapshot | GET /patient/{id}/snapshot?as_of=2025-01-01 in API docs |

---

## API Documentation

All endpoints documented at: **http://localhost:8000/docs**

Key endpoints to demonstrate:
- `POST /auth/login` → JWT returned
- `POST /documents/upload` → multi-format file processing
- `POST /search/hybrid` → hybrid search with confidence scores
- `POST /ai/agent/query` → master agent router (patient=Gemini, doctor=GPT)
- `POST /ai/doctor/contraindication` → full agentic tool loop
- `GET /admin/costs` → cost breakdown under $10

---

## Test Credentials (for evaluators)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@meditrace.com | admin123 |
| Doctor | doctor@meditrace.com | dr001 |
| Patient | patient@meditrace.com | pt001 |
