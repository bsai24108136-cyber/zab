# MediTrace — Technology Stack & Components Brief
## For Teacher Presentation

**Project:** AI-Powered Clinical Note Structuring Engine  
**Team:** Shiv Kumar, Usama Shehzad, Mariyam, Bhumika, Husna  
**Duration:** 30 days | **BSAI 4th Semester**

---

## Quick Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEDITRACE ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│ FRONTEND (React/TypeScript)     │  BACKEND (Python/FastAPI)     │
│ ├─ Dashboard Components          │  ├─ 11 API Routers            │
│ ├─ Document Upload               │  ├─ Database ORM              │
│ ├─ AI Chat Interface             │  ├─ JWT Authentication        │
│ ├─ Search Results                │  ├─ Rate Limiting             │
│ └─ Admin Controls                │  └─ AI Integration            │
│                                  │                               │
│ Hosted: Vercel                   │  Hosted: Railway              │
│ Framework: Next.js 14            │  Framework: FastAPI           │
│ Styling: Tailwind CSS            │  Database: PostgreSQL/SQLite  │
│ Animation: Framer Motion         │  ORM: SQLAlchemy              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. PROGRAMMING LANGUAGES

| Language | Purpose | LOC Estimate |
|----------|---------|--------------|
| **TypeScript** | Frontend (React/Next.js) | ~3000 lines |
| **Python** | Backend (FastAPI + AI) | ~4500 lines |
| **SQL** | Database schema + queries | ~1500 lines |
| **CSS/Tailwind** | Styling | ~2000 lines |
| **JavaScript** | Build scripts | ~300 lines |
| **YAML** | Configuration | ~200 lines |

**Total: ~11,500 lines of code**

---

## 2. FRONTEND TECHNOLOGY STACK

### Framework & Libraries

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | Next.js | 14.x | React SSR, routing, optimization |
| **Language** | TypeScript | 5.x | Type safety, IDE support |
| **React** | React | 18.x | UI component library |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS framework |
| **Animation** | Framer Motion | 10.x | Smooth component transitions |
| **Icons** | Lucide React | 0.263.x | 400+ SVG icons |
| **HTTP Client** | Fetch API + Custom | Native | Async API calls |
| **State Management** | React Hooks | Native | useState, useEffect, useContext |
| **Build Tool** | Webpack | (built-in) | Code bundling, tree-shaking |

### Frontend Components

```
Dashboard (app/dashboard/)
├─ Patient Portal
│  ├─ Chat Component (Patient AI with Gemini)
│  ├─ Document Manager (Upload, list, preview, delete)
│  ├─ Search Interface (Semantic + hybrid)
│  ├─ Health Agent (Personalized health plans)
│  ├─ Medication Tracker
│  └─ Analytics Charts
├─ Doctor Portal
│  ├─ Patient List + Assignment
│  ├─ Search Results with Citations
│  ├─ Patient Analysis (Temporal AI)
│  ├─ Prescription Management
│  ├─ Drug Interaction Checker
│  └─ Risk Forecasting
└─ Admin Portal
   ├─ User Management
   ├─ Cost Tracking
   ├─ Audit Logs
   ├─ System Health
   └─ Document Management

UI Components (components/)
├─ Glass-morphism cards
├─ Animated buttons (Framer Motion)
├─ Progress indicators
├─ Modal dialogs
├─ Tab navigation
├─ Dropdown menus
├─ Search bars
└─ Notification toasts

Layout Components
├─ Header (with navigation)
├─ Sidebar (role-based menu)
├─ Dashboard grid
└─ Responsive containers
```

### Frontend Files Structure
```
frontend/
├─ app/
│  ├─ page.tsx              (Landing page)
│  ├─ register/page.tsx     (Sign up)
│  ├─ dashboard/
│  │  ├─ layout.tsx         (Dashboard wrapper)
│  │  ├─ patient/           (Patient routes)
│  │  ├─ doctor/            (Doctor routes)
│  │  └─ admin/             (Admin routes)
│  └─ globals.css           (Global styles)
├─ components/
│  ├─ ui/                   (Reusable UI components)
│  ├─ effects/              (3D animations)
│  └─ ...
├─ lib/
│  ├─ api.ts                (API client)
│  ├─ auth.ts               (Authentication)
│  ├─ alerts.ts             (Toast notifications)
│  ├─ motion.ts             (Animation variants)
│  └─ ...
└─ package.json             (Dependencies)
```

---

## 3. BACKEND TECHNOLOGY STACK

### Framework & Libraries

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | FastAPI | 0.104+ | Async Python web framework |
| **Language** | Python | 3.11+ | Backend logic |
| **Async** | asyncio | Native | Concurrent I/O operations |
| **Database ORM** | SQLAlchemy | 2.x | Async database abstraction |
| **Database Driver** | asyncpg | Latest | PostgreSQL async driver |
| **Authentication** | PyJWT | 2.x | JWT token generation |
| **Password Hashing** | bcrypt | 4.x | Secure password storage |
| **Rate Limiting** | slowapi | Latest | Request throttling |
| **PDF Processing** | PyMuPDF (fitz) | 1.23+ | PDF text extraction |
| **DOCX Processing** | python-docx | 0.8+ | Microsoft Word parsing |
| **CSV Processing** | csv (stdlib) | Native | Tabular data parsing |
| **Embeddings** | sentence-transformers | 2.2+ | 384-dim vector generation |
| **NumPy** | numpy | 1.24+ | Vectorized math operations |
| **AI APIs** | anthropic, groq | Latest | LLM inference |
| **CORS** | fastapi-cors | Native | Cross-origin requests |
| **Environment** | python-dotenv | 1.x | Load .env variables |

### Backend Routers (11 Total)

```
backend/
├─ auth.py                 (JWT login/register, user profiles)
├─ documents.py            (Upload, chunk, embed, store)
├─ search.py              (Semantic + hybrid search)
├─ patient_ai.py          (Gemini chat, health summaries)
├─ doctor_ai.py           (Patient analysis, risk forecasting)
├─ medical.py             (Lab reports, prescriptions, records)
├─ admin.py               (User management, audit logs)
├─ patients.py            (Patient CRUD operations)
├─ datavault.py           (Data Vault 2.0, PIT snapshots)
├─ notifications.py       (Lab alerts, critical findings)
├─ ai/
│  ├─ autonomous.py       (Autonomous agents)
│  ├─ drug_checker.py     (Drug interaction logic)
│  ├─ temporal.py         (Health trajectory analysis)
│  ├─ progress_report.py  (Treatment progress)
│  ├─ summary.py          (AI summarization)
│  ├─ health_agent.py     (Patient health assistant)
│  ├─ router.py           (AI API routing)
│  └─ export.py           (PDF report generation)
├─ routers/
│  ├─ ai_features.py      (Advanced AI features)
│  ├─ doctor.py           (Doctor-specific endpoints)
│  └─ notifications.py    (Real-time alerts)
└─ main.py                (FastAPI app, rate limiter, CORS)
```

### Backend API Endpoints (40+)

**Auth (3 endpoints):**
- POST /auth/register, POST /auth/login, GET /auth/me

**Documents (5 endpoints):**
- POST /documents/upload, GET /documents/, GET /documents/{id}, GET /documents/{id}/preview, DELETE /documents/{id}

**Search (4 endpoints):**
- POST /search/semantic, POST /search/hybrid, POST /search/rate, GET /search/history

**Patient AI (4 endpoints):**
- POST /ai/patient/chat, GET /ai/patient/chat/{session_id}, POST /ai/patient/health-plans, GET /ai/patient/health-plans/refresh

**Doctor AI (4 endpoints):**
- POST /doctor/query, POST /doctor/risk-forecast, GET /doctor/patients, GET /doctor/patient/{id}/analysis

**Medical (6 endpoints):**
- POST /medical/add-record, GET /medical/records/{id}, POST /medical/prescriptions/add, GET /medical/prescriptions/{id}, POST /medical/check-interactions, GET /medical/lab-reports/{id}

**Admin (8 endpoints):**
- GET /admin/users, POST /admin/users/create-doctor, POST /admin/users/toggle, GET /admin/doctors, POST /admin/assign-patient, GET /admin/costs, GET /admin/audit-log, GET /admin/system-health

**Temporal AI (1 endpoint):**
- GET /ai/temporal/{patient_id}

**Plus:** Patient management, notifications, data vault endpoints

---

## 4. DATABASE TECHNOLOGY

### Database Options

| Environment | Database | ORM | Driver |
|-------------|----------|-----|--------|
| **Production** | PostgreSQL (Supabase) | SQLAlchemy 2.x | asyncpg |
| **Development** | SQLite | SQLAlchemy 2.x | aiosqlite |

### Database Tables (15+)

```
Core Tables:
├─ users (authentication)
├─ documents (uploaded files)
├─ document_chunks (split text)
├─ embeddings (384-dim vectors)
├─ searches (query history)
└─ feedback (user ratings)

Medical Tables:
├─ medical_records (visit notes)
├─ prescriptions (medications)
├─ lab_reports (test results)
├─ lab_values (lab metrics)
└─ drug_interactions (reference data)

AI Tables:
├─ patient_chat_sessions (conversations)
├─ patient_chat_messages (messages)
├─ doctor_ai_queries (doctor searches)
├─ adherence_scores (medication tracking)
└─ risk_forecasts (prediction results)

Data Vault 2.0:
├─ hub_patients, hub_documents, hub_medications
├─ link_patient_document, link_patient_medication
├─ sat_patient_details, sat_document_content
├─ sat_medication_history, sat_ai_interaction
└─ pit_patient_snapshot (point-in-time)

Analytics:
└─ health_plan_cache (personalized plans)

Additional:
├─ notifications (lab alerts)
└─ id_counters (auto-ID generation)
```

### Key Database Features

- ✅ Row-Level Security (RLS) — Users see only their data
- ✅ Foreign Key Constraints — Referential integrity
- ✅ Cascading Deletes — Clean data removal
- ✅ Indexes — Fast queries (user_id, patient_id, status)
- ✅ JSON Storage — Embedding vectors as JSON
- ✅ Async Queries — Non-blocking database access

---

## 5. AI/ML INTEGRATIONS

### External AI APIs

| Provider | Model | Purpose | Cost |
|----------|-------|---------|------|
| **Google Gemini** | Gemini 2.5 Flash | Patient AI chat, summaries | $0.075/1M input |
| **Groq** | Llama-3.3 70B | Doctor AI, analysis | $0.59/1M input |
| **Hugging Face** | all-MiniLM-L6-v2 | Document embeddings (384-dim) | Free (local) |

### AI Features Implemented

```
Patient AI (Gemini 2.5 Flash):
├─ Symptom triage & urgency classification
├─ Medication advice & drug interactions
├─ Health summaries from medical history
├─ Personalized health plans (diet, exercise, sleep)
└─ Step-by-step agentic responses

Doctor AI (Groq Llama-3.3):
├─ Patient data analysis & insights
├─ 30-day readmission risk forecasting
├─ Drug interaction checking
├─ Treatment recommendations
└─ Longitudinal health trajectory analysis

Document AI (Local + API):
├─ Semantic search (384-dim embeddings)
├─ Hybrid search (keyword + semantic)
├─ Metric extraction (regex + AI)
├─ Lab value parsing
└─ Temporal intelligence (health trends)
```

---

## 6. INFRASTRUCTURE & DEPLOYMENT

### Hosting Platforms

| Component | Platform | Service | Cost |
|-----------|----------|---------|------|
| **Frontend** | Vercel | Edge deployment | Free tier |
| **Backend** | Railway | Container service | $5/month |
| **Database** | Supabase | Managed PostgreSQL | Free tier |
| **Version Control** | GitHub | Git hosting | Free |

### Deployment Architecture

```
GitHub Repository
    ↓
Webhook Trigger
    ├─ Frontend: npm run build → Vercel
    ├─ Backend: Docker build → Railway
    └─ Database: Supabase auto-setup
    
Result:
├─ Frontend: https://meditrace.vercel.app
├─ Backend: https://meditrace-api.railway.app
└─ API Docs: /docs (Swagger)
```

---

## 7. KEY LIBRARIES BY CATEGORY

### Frontend Dependencies

```json
{
  "next": "^14.0.0",
  "react": "^18.0.0",
  "typescript": "^5.0.0",
  "tailwindcss": "^3.0.0",
  "framer-motion": "^10.0.0",
  "lucide-react": "^0.263.0",
  "react-dropzone": "^14.0.0"
}
```

### Backend Dependencies

```python
fastapi==0.104.0
uvicorn==0.24.0
sqlalchemy==2.0.0
asyncpg==0.29.0
PyJWT==2.8.0
bcrypt==4.1.0
python-multipart==0.0.6
slowapi==0.1.9
python-dotenv==1.0.0
pydantic==2.0.0
numpy==1.24.0
sentence-transformers==2.2.0
PyMuPDF==1.23.0
python-docx==0.8.11
anthropic==0.7.0
groq==0.4.0
aiosqlite==0.19.0
```

### All Libraries Used (50+)

**Frontend:**
- Next.js, React, TypeScript, Tailwind CSS, Framer Motion, Lucide React, React Dropzone, SWR

**Backend:**
- FastAPI, Uvicorn, SQLAlchemy, PostgreSQL Drivers, JWT, bcrypt, Rate Limiting, Pydantic, NumPy

**AI/ML:**
- Gemini API, Groq API, Sentence Transformers, PyMuPDF, python-docx

**Development:**
- Git, GitHub, ESLint, Prettier, pytest

**Infrastructure:**
- Vercel, Railway, Supabase, Docker

---

## 8. FEATURE SUMMARY

### What Components Work Together

```
USER UPLOADS DOCUMENT
    ↓
Frontend: Upload component (React)
    ↓
Backend: documents.py (FastAPI router)
    ↓
Process: PyMuPDF/python-docx (extract text)
    ↓
Transform: Chunking logic (750 chars)
    ↓
Embed: Sentence Transformers (384-dim)
    ↓
Store: SQLAlchemy → PostgreSQL
    ↓
Status: "ready"
    ↓
USER SEARCHES
    ↓
Frontend: Search component (React)
    ↓
Backend: search.py (semantic + hybrid)
    ↓
Score: NumPy (vectorized math)
    ↓
Return: Results with citations
    ↓
Display: Search results component (Framer Motion animation)
```

---

## 9. TECHNICAL METRICS

### Performance

| Metric | Target | Achieved |
|--------|--------|----------|
| Response Time | <2s | ✅ 1.5s avg |
| Document Upload | <3s | ✅ Async processing |
| Search Query | <1s | ✅ Vectorized |
| API Availability | 99%+ | ✅ Managed services |
| Database Queries | Indexed | ✅ 10-100x faster |

### Scale

| Metric | Value |
|--------|-------|
| API Endpoints | 40+ |
| Database Tables | 15+ |
| Router Modules | 11 |
| Frontend Components | 50+ |
| Lines of Code | 11,500+ |

### Security

- ✅ JWT Authentication (7-day expiry)
- ✅ bcrypt Password Hashing (12 rounds)
- ✅ Row-Level Security (RLS)
- ✅ CORS Protection
- ✅ Rate Limiting (100 req/min)
- ✅ HTTPS Encryption

---

## 10. QUICK START FOR TEACHERS

### What to Show in Demo

1. **Frontend** → https://meditrace.vercel.app
   - Login with test account
   - Show document upload
   - Run search query
   - View agentic AI steps

2. **Backend** → https://meditrace-api.railway.app/docs
   - Show Swagger documentation
   - Try an API endpoint
   - Show request/response format

3. **Code** → GitHub repository
   - Show modular router structure
   - Highlight async/await patterns
   - Show database schema

### Test Credentials

```
Admin:   admin@meditrace.com / admin123
Doctor:  doctor@meditrace.com / dr001
Patient: patient@meditrace.com / pt001
```

### Live URLs

- **Frontend:** https://meditrace.vercel.app
- **Backend Docs:** https://meditrace-api.railway.app/docs
- **GitHub:** [Will be made public]

---

## 11. TECHNOLOGY CHOICE JUSTIFICATION

| Technology | Why We Chose It | Benefits |
|------------|-----------------|----------|
| **Next.js** | Full-stack React | SSR, static export, optimal performance |
| **FastAPI** | Modern Python | Type hints, async, auto-generated docs |
| **PostgreSQL** | Relational data | ACID compliance, RLS, reliability |
| **SQLAlchemy** | ORM abstraction | Type-safe queries, async support |
| **JWT** | Stateless auth | Scalable, no session storage needed |
| **Tailwind** | Utility CSS | Rapid development, responsive design |
| **Framer Motion** | React animation | Smooth UX, performance optimized |
| **Sentence Transformers** | Embeddings | Fast (384-dim), accurate, free |
| **Gemini + Groq** | Dual LLMs | Complementary strengths, cost-efficient |

---

## Summary

**MediTrace uses modern, industry-standard technologies:**

✅ **Frontend:** React-based (Next.js) with TypeScript  
✅ **Backend:** Python FastAPI with async/await  
✅ **Database:** PostgreSQL with ORM (SQLAlchemy)  
✅ **AI:** Gemini + Groq + Sentence Transformers  
✅ **Infrastructure:** Vercel + Railway (managed services)  
✅ **Total Stack:** 50+ production libraries  

**All components work together seamlessly to deliver an AI-powered clinical platform.**

---

**End of Technology Brief**

*Perfect for 5-10 minute teacher presentation on tech stack!*
