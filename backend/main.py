"""
MediTrace — FastAPI Main Application
CORS + all routers registered + lifespan DB init + rate limiting
"""
import logging
import sys
import os

# Ensure backend/routers is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "routers"))
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from database import init_db, get_settings, AsyncSessionLocal
from auth import router as auth_router, seed_default_users
from documents import router as documents_router
from search import router as search_router
from patient_ai import router as patient_ai_router
from doctor_ai import router as doctor_ai_router
from medical import router as medical_router
from admin import router as admin_router
from datavault import router as datavault_router
from patients import router as patients_router
from routers.ai_features import router as ai_features_router
from routers.notifications import router as notifications_router
from routers.doctor import router as doctor_features_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


# ─────────────────────────────────────────────
#  RATE LIMITER
# ─────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])


# ─────────────────────────────────────────────
#  LIFESPAN — startup/shutdown
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("MediTrace starting up...")
    # Create all DB tables
    await init_db()

    # ── Safe column migrations (idempotent — runs every startup) ─────────────
    # Adds any columns that exist in the ORM model but not yet in the DB file.
    # Only applies to SQLite (dev); Supabase/Postgres uses supabase_schema.sql.
    await _run_sqlite_migrations()

    # Seed default users
    async with AsyncSessionLocal() as db:
        await seed_default_users(db)

    # Pre-load embedding model (so first request isn't slow)
    try:
        from embeddings import get_embedding_model
        get_embedding_model()
    except Exception as e:
        logger.warning(f"Could not pre-load embedding model: {e}")

    logger.info("MediTrace ready ✓")
    yield
    logger.info("MediTrace shutting down.")


async def _run_sqlite_migrations():
    """
    Idempotent startup migration for SQLite dev DB.
    Adds any missing columns defined in the ORM that the DB file doesn't have yet.
    Safe to run on every startup — skips columns that already exist.
    """
    db_url = settings.database_url
    if "sqlite" not in db_url:
        return  # Postgres/Supabase: use supabase_schema.sql instead

    import sqlite3, re
    # Extract file path from sqlite+aiosqlite:///./meditrace.db
    path = re.sub(r"^sqlite\+aiosqlite:///", "", db_url)
    if path.startswith("./"):
        import os
        path = os.path.join(os.path.dirname(__file__), path[2:])

    # Table → list of (column_name, sql_definition)
    MIGRATIONS: dict[str, list[tuple[str, str]]] = {
        "prescriptions": [
            ("interaction_override", "BOOLEAN DEFAULT 0"),
            ("interaction_warning",  "TEXT"),
        ],
        "health_plan_cache": [
            # This table is created by init_db() if the model exists;
            # listed here for safety if the ORM model is added later.
        ],
    }

    try:
        conn = sqlite3.connect(path)
        cur  = conn.cursor()
        for table, columns in MIGRATIONS.items():
            if not columns:
                continue
            cur.execute(f"PRAGMA table_info({table})")
            existing = {row[1] for row in cur.fetchall()}
            for col_name, col_def in columns:
                if col_name in existing:
                    continue
                sql = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"
                cur.execute(sql)
                logger.info(f"[Migration] Added column {table}.{col_name}")
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"[Migration] Could not apply SQLite migrations: {e}")


# ─────────────────────────────────────────────
#  APP FACTORY
# ─────────────────────────────────────────────
app = FastAPI(
    title="MediTrace API",
    description="AI-Powered Clinical Note Structuring Engine for Pakistani Clinics",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,            # restrict in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
#  GLOBAL ERROR HANDLER
# ─────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )


# ─────────────────────────────────────────────
#  REGISTER ROUTERS
# ─────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(search_router)
app.include_router(patient_ai_router)
app.include_router(doctor_ai_router)
app.include_router(medical_router)
app.include_router(admin_router)
app.include_router(datavault_router)
app.include_router(patients_router)
app.include_router(ai_features_router)
app.include_router(notifications_router)
app.include_router(doctor_features_router)

# ─────────────────────────────────────────────
#  AGENT ROUTER — routes by role
# ─────────────────────────────────────────────
from fastapi import Depends
from auth import get_current_user
from models import User
from pydantic import BaseModel


class AgentQueryRequest(BaseModel):
    query: str
    patient_id: str | None = None


@app.post("/ai/agent/query", tags=["Agent Router"])
async def agent_router(
    body: AgentQueryRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Master agent router.
    patient → Gemini 1.5 Flash agent
    doctor/admin → Groq / Llama-3.3 agent
    """
    from patient_ai import patient_agent, PatientAgentRequest
    from doctor_ai import run_doctor_agent

    async with AsyncSessionLocal() as real_db:
        if current_user.role == "patient":
            req = PatientAgentRequest(query=body.query, patient_id=current_user.id)
            return await patient_agent(req, real_db, current_user)
        else:
            return await run_doctor_agent(body.query, body.patient_id, current_user, real_db)


# ─────────────────────────────────────────────
#  HEALTH CHECK
# ─────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def health():
    return {
        "service": "MediTrace API",
        "version": settings.app_version,
        "status": "healthy",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
