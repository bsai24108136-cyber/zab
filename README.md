# MediTrace — AI-Powered Clinical Note Structuring Engine

MediTrace transforms unstructured medical records (free-text notes, prescription PDFs, WhatsApp exports) into structured, searchable clinical intelligence. It is both a hospital management system and an AI document intelligence platform for private clinics in Pakistan.

## Team
- Shiv Kumar · Usama Shehzad · Mariyam · Bhumika · Husna
- BSAI 4th Semester Final Project · Deadline: 30 days

## Live Demo
> **Frontend:** https://meditrace.vercel.app  
> **Backend API Docs:** https://meditrace-api.railway.app/docs

### Test Credentials
| Role    | Email                    | Password |
|---------|--------------------------|----------|
| Admin   | admin@meditrace.com      | admin123 |
| Doctor  | doctor@meditrace.com     | dr001    |
| Patient | patient@meditrace.com    | pt001    |

---

## Local Setup (copy-paste, zero ambiguity)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git

### 1. Clone & enter repo
```bash
git clone https://github.com/your-org/meditrace.git
cd meditrace
```

### 2. Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env and add your API keys:
# GEMINI_API_KEY=your_key_here
# OPENAI_API_KEY=your_key_here
# SECRET_KEY=your_random_secret_here
# DATABASE_URL=sqlite:///./meditrace.db

# Start backend
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local:
# NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
# Open http://localhost:3000
```

---

## Tech Stack

| Layer        | Technology                          | Version  |
|--------------|-------------------------------------|----------|
| Backend      | FastAPI                             | 0.111.x  |
| Auth         | python-jose (JWT) + passlib (bcrypt)| latest   |
| PDF parsing  | PyMuPDF (fitz)                      | 1.24.x   |
| DOCX parsing | python-docx                         | 1.1.x    |
| Embeddings   | sentence-transformers               | 3.0.x    |
| Patient AI   | google-generativeai (Gemini Flash)  | 0.7.x    |
| Doctor AI    | openai (GPT-4o-mini)                | 1.35.x   |
| Rate limiting| slowapi                             | 0.1.x    |
| Database     | SQLite (dev) / PostgreSQL (prod)    | -        |
| Frontend     | Next.js 14                          | 14.x     |
| Styling      | Tailwind CSS                        | 3.x      |
| Charts       | Recharts                            | 2.x      |
| File upload  | react-dropzone                      | 14.x     |

---

## AI Models

### Gemini 1.5 Flash (Patient-facing)
- **All** patient chat, triage, reminders, term explanation
- Streaming via SSE (Server-Sent Events)
- Free tier: 15 req/min, 1M tokens/day
- Cost: ~$0.00 (free tier)

### GPT-4o-mini (Doctor-facing)
- All clinical features with OpenAI function calling
- Treatment suggestions, risk forecasting, lab analysis, contraindications
- Cost: ~$0.00015/1K input + $0.0006/1K output tokens
- Estimated total: **under $3**

---

## Features

- ✅ JWT auth with 3 roles (Admin / Doctor / Patient)
- ✅ Multi-format upload (PDF, DOCX, TXT, CSV)
- ✅ Semantic embeddings (sentence-transformers, 384-dim, local/free)
- ✅ Hybrid search (semantic + keyword, confidence scores)
- ✅ Patient AI chat (Gemini, streaming, triage, reminders)
- ✅ Doctor AI assistant (GPT-4o-mini, 6 tabs, function calling)
- ✅ Agentic AI with visible step indicators and tool chips
- ✅ GenAI citations on every response
- ✅ Data Vault 2.0 schema (append-only, PIT snapshots)
- ✅ Dashboard: file manager + analytics + search history + metrics
- ✅ Mobile responsive, rate limiting, row-level security

---

## Cost Breakdown

| Model             | Usage              | Cost      |
|-------------------|--------------------|-----------|
| Gemini 1.5 Flash  | All patient calls  | ~$0.00    |
| GPT-4o-mini       | All doctor calls   | ~$2–3     |
| Railway (backend) | Free tier          | $0.00     |
| Vercel (frontend) | Free tier          | $0.00     |
| **TOTAL**         |                    | **< $10** |

---

## API Documentation
Visit `/docs` on the live backend for interactive Swagger UI.

## Known Limitations
- Embedding generation uses CPU (no GPU) — large files may take 10–30s
- Gemini free tier: 15 req/min (rate-limited in backend)
- SQLite used in local dev; switch to PostgreSQL for production
- Drug interaction dictionary covers Pakistani brand names only
