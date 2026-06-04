-- ============================================================
-- MEDITRACE — SUPABASE SCHEMA  (v2.0 — 2026-05-15)
-- Matches backend/models.py exactly.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CORE AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    email              TEXT UNIQUE NOT NULL,
    password_hash      TEXT NOT NULL,
    role               TEXT NOT NULL CHECK (role IN ('admin','doctor','patient')),
    full_name          TEXT,
    phone              TEXT,
    specialization     TEXT,                                -- doctor accounts
    assigned_doctor_id TEXT REFERENCES users(id) ON DELETE SET NULL,  -- patient → doctor
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);

-- ============================================================
-- 2. DOCUMENTS & EMBEDDINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    filename        TEXT NOT NULL,
    file_type       TEXT CHECK (file_type IN ('pdf','docx','txt','csv')),
    file_size       INT,
    raw_text        TEXT,
    structured_json TEXT,
    ai_summary      TEXT,
    upload_date     TIMESTAMPTZ DEFAULT NOW(),
    chunk_count     INT DEFAULT 0,
    status          TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','ready','error'))
);

CREATE INDEX IF NOT EXISTS idx_documents_user    ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_status  ON documents(status);

CREATE TABLE IF NOT EXISTS document_chunks (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT  NOT NULL,
    chunk_text  TEXT NOT NULL,
    chunk_size  INT  NOT NULL,
    start_char  INT  NOT NULL,
    end_char    INT  NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);

CREATE TABLE IF NOT EXISTS embeddings (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    chunk_id    TEXT UNIQUE NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vector_json TEXT NOT NULL,           -- JSON array of 384 floats
    model_name  TEXT DEFAULT 'all-MiniLM-L6-v2',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_document ON embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_user     ON embeddings(user_id);

-- ============================================================
-- 3. SEARCH & FEEDBACK
-- ============================================================

CREATE TABLE IF NOT EXISTS searches (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query_text       TEXT NOT NULL,
    search_type      TEXT CHECK (search_type IN ('semantic','hybrid','keyword')),
    results_json     TEXT,
    confidence_score FLOAT,
    response_time_ms INT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);

CREATE TABLE IF NOT EXISTS feedback (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    search_id  TEXT REFERENCES searches(id) ON DELETE SET NULL,
    rating     INT  CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. MEDICAL RECORDS & PRESCRIPTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS medical_records (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id  TEXT NOT NULL REFERENCES users(id),
    symptoms   TEXT,
    diagnosis  TEXT,
    notes      TEXT,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_records_patient ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_doctor  ON medical_records(doctor_id);

CREATE TABLE IF NOT EXISTS prescriptions (
    id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    rx_number             TEXT UNIQUE NOT NULL,
    patient_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id             TEXT NOT NULL REFERENCES users(id),
    medicine_name         TEXT NOT NULL,
    medicine_normalized   TEXT,
    dosage                TEXT,
    frequency             TEXT,
    instructions          TEXT,
    duration_days         INT,
    start_date            DATE NOT NULL,
    status                TEXT DEFAULT 'active'
                              CHECK (status IN ('active','completed','cancelled')),
    interaction_override  BOOLEAN DEFAULT FALSE,   -- doctor overrode a DANGEROUS warning
    interaction_warning   TEXT,                    -- stores the warning text for audit trail
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);

-- Migration: add columns to existing prescriptions table (safe to run multiple times)
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS interaction_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS interaction_warning  TEXT;

-- ============================================================
-- 5. LAB REPORTS & LAB VALUES
-- ============================================================

CREATE TABLE IF NOT EXISTS lab_reports (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id     TEXT NOT NULL REFERENCES users(id),
    document_id   TEXT REFERENCES documents(id) ON DELETE SET NULL,
    file_path     TEXT,
    result_status TEXT DEFAULT 'pending_review'
                      CHECK (result_status IN (
                          'pending_review','reviewed_normal',
                          'reviewed_abnormal','reviewed_critical'
                      )),
    doctor_note   TEXT,
    uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lab_reports_patient ON lab_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_doctor  ON lab_reports(doctor_id);

CREATE TABLE IF NOT EXISTS lab_values (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    lab_report_id  TEXT NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
    test_name      TEXT NOT NULL,
    value          FLOAT,
    unit           TEXT,
    reference_low  FLOAT,
    reference_high FLOAT,
    status         TEXT CHECK (status IN ('normal','high','low','critical')),
    recorded_at    DATE
);

CREATE INDEX IF NOT EXISTS idx_lab_values_report ON lab_values(lab_report_id);

-- ============================================================
-- 6. DRUG INTERACTIONS (static reference table)
-- ============================================================

CREATE TABLE IF NOT EXISTS drug_interactions (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    drug_a      TEXT NOT NULL,
    drug_b      TEXT NOT NULL,
    severity    TEXT NOT NULL CHECK (severity IN ('mild','moderate','severe','critical')),
    description TEXT NOT NULL,
    source      TEXT
);

-- ============================================================
-- 7. PATIENT AI (chat sessions + messages)
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_chat_sessions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    message_count   INT DEFAULT 0,
    model_used      TEXT DEFAULT 'gemini-2.5-flash',
    total_tokens    INT DEFAULT 0,
    total_cost_usd  NUMERIC(8,6) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_patient ON patient_chat_sessions(patient_id);

CREATE TABLE IF NOT EXISTS patient_chat_messages (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    session_id   TEXT NOT NULL REFERENCES patient_chat_sessions(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content      TEXT NOT NULL,
    tools_called TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    tokens       INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON patient_chat_messages(session_id);

-- ============================================================
-- 8. DOCTOR AI QUERIES
-- ============================================================

CREATE TABLE IF NOT EXISTS doctor_ai_queries (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    doctor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    query_type    TEXT NOT NULL,    -- query|suggest|pharmacy|risk|lab|contraindication
    query_text    TEXT NOT NULL,
    response_json TEXT,
    model_used    TEXT DEFAULT 'groq-llama-3.3',
    confidence    FLOAT,
    tokens        INT DEFAULT 0,
    cost_usd      NUMERIC(8,6) DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_ai_doctor  ON doctor_ai_queries(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_ai_patient ON doctor_ai_queries(patient_id);

-- ============================================================
-- 9. ADHERENCE SCORES & RISK FORECASTS
-- ============================================================

CREATE TABLE IF NOT EXISTS adherence_scores (
    id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prescription_id      TEXT REFERENCES prescriptions(id) ON DELETE SET NULL,
    score                FLOAT NOT NULL,          -- 0–100
    missed_refills       INT DEFAULT 0,
    risk_level           TEXT NOT NULL CHECK (risk_level IN ('Low','Medium','High')),
    calculated_at        TIMESTAMPTZ DEFAULT NOW(),
    next_refill_forecast DATE
);

CREATE TABLE IF NOT EXISTS risk_forecasts (
    id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id             TEXT NOT NULL REFERENCES users(id),
    readmission_risk_pct  FLOAT,
    progression_flags     TEXT,         -- JSON
    recommended_tests     TEXT,         -- JSON
    forecast_horizon_days INT DEFAULT 30,
    generated_at          TIMESTAMPTZ DEFAULT NOW(),
    model_used            TEXT DEFAULT 'groq-llama-3.3'
);

-- ============================================================
-- 10. AUTONOMOUS NOTIFICATIONS (AI lab alerts)
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    doctor_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    lab_report_id TEXT REFERENCES lab_reports(id) ON DELETE SET NULL,
    severity      TEXT NOT NULL CHECK (severity IN ('routine','urgent','critical')),
    title         TEXT NOT NULL,
    message       TEXT NOT NULL,
    is_read       BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_doctor ON notifications(doctor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read   ON notifications(doctor_id, is_read);

-- ============================================================
-- 11. DATA VAULT 2.0
-- ============================================================

-- Hubs
CREATE TABLE IF NOT EXISTS hub_patients (
    hash_key      TEXT PRIMARY KEY,
    patient_id    TEXT NOT NULL UNIQUE,
    load_date     TIMESTAMPTZ DEFAULT NOW(),
    record_source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hub_documents (
    hash_key      TEXT PRIMARY KEY,
    doc_id        TEXT NOT NULL UNIQUE,
    load_date     TIMESTAMPTZ DEFAULT NOW(),
    record_source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hub_medications (
    hash_key              TEXT PRIMARY KEY,
    med_name_normalized   TEXT NOT NULL UNIQUE,
    load_date             TIMESTAMPTZ DEFAULT NOW()
);

-- Links
CREATE TABLE IF NOT EXISTS link_patient_document (
    hash_key     TEXT PRIMARY KEY,
    patient_hash TEXT NOT NULL REFERENCES hub_patients(hash_key),
    doc_hash     TEXT NOT NULL REFERENCES hub_documents(hash_key),
    load_date    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS link_patient_medication (
    hash_key     TEXT PRIMARY KEY,
    patient_hash TEXT NOT NULL REFERENCES hub_patients(hash_key),
    med_hash     TEXT NOT NULL REFERENCES hub_medications(hash_key),
    load_date    TIMESTAMPTZ DEFAULT NOW()
);

-- Satellites
CREATE TABLE IF NOT EXISTS sat_patient_details (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_hash  TEXT NOT NULL REFERENCES hub_patients(hash_key),
    load_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    load_end_date TIMESTAMPTZ,                -- NULL = current record
    name          TEXT,
    dob           DATE,
    phone         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sat_patient_hash ON sat_patient_details(patient_hash);

CREATE TABLE IF NOT EXISTS sat_document_content (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    doc_hash        TEXT NOT NULL REFERENCES hub_documents(hash_key),
    load_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_text        TEXT,
    structured_json TEXT,
    ai_summary      TEXT
);

CREATE TABLE IF NOT EXISTS sat_medication_history (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    med_hash     TEXT NOT NULL REFERENCES hub_medications(hash_key),
    patient_hash TEXT NOT NULL REFERENCES hub_patients(hash_key),
    load_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dosage       TEXT,
    frequency    TEXT,
    prescribed_by TEXT
);

CREATE TABLE IF NOT EXISTS sat_ai_interaction (
    hash_key         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_hash        TEXT NOT NULL,
    load_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model_used       TEXT NOT NULL,   -- gemini-2.5-flash | groq-llama-3.3
    query_text       TEXT,
    response_text    TEXT,
    tools_called     TEXT,            -- JSON array
    tokens_used      INT DEFAULT 0,
    cost_usd         NUMERIC(8,6) DEFAULT 0,
    response_time_ms INT DEFAULT 0,
    confidence_score FLOAT
);

-- Point-in-Time table
CREATE TABLE IF NOT EXISTS pit_patient_snapshot (
    id                             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_hash                   TEXT NOT NULL REFERENCES hub_patients(hash_key),
    snapshot_date                  TIMESTAMPTZ NOT NULL,
    sat_patient_details_ldts       TIMESTAMPTZ,
    sat_medication_history_ldts    TIMESTAMPTZ,
    sat_document_content_ldts      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_pit_patient_date ON pit_patient_snapshot(patient_hash, snapshot_date);

-- ============================================================
-- 12. ID COUNTERS (auto-generate PT-001 style IDs)
-- ============================================================

CREATE TABLE IF NOT EXISTS id_counters (
    counter_name  TEXT PRIMARY KEY,
    current_value INT DEFAULT 0
);

INSERT INTO id_counters (counter_name, current_value)
VALUES ('patient', 0), ('doctor', 0), ('prescription', 0)
ON CONFLICT (counter_name) DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_id(counter TEXT, prefix TEXT)
RETURNS TEXT AS $$
DECLARE next_val INT;
BEGIN
    UPDATE id_counters SET current_value = current_value + 1
    WHERE counter_name = counter
    RETURNING current_value INTO next_val;
    RETURN prefix || LPAD(next_val::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 13. DEFAULT ACCOUNTS
-- password hash = bcrypt("admin123") — CHANGE IMMEDIATELY
-- ============================================================

INSERT INTO users (id, email, password_hash, role, full_name, is_active)
VALUES (
    'admin-00000000-0000-0000-0000-000000000001',
    'admin@meditrace.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFYVcKGE.f9BBS.',
    'admin',
    'MediTrace Admin',
    TRUE
) ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, full_name, specialization, is_active)
VALUES (
    'doctor-00000000-0000-0000-0000-000000000001',
    'doctor@meditrace.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFYVcKGE.f9BBS.',
    'doctor',
    'Dr. Sarah Ahmed',
    'Internal Medicine',
    TRUE
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 14. HEALTH PLAN CACHE  (My Health Agent — patient portal)
-- Stores AI-generated health plans per patient.
-- Each call to GET /ai/patient/health-plans writes a new row.
-- POST /ai/patient/health-plans/refresh also writes a new row.
-- ============================================================

CREATE TABLE IF NOT EXISTS health_plan_cache (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    patient_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plans_json      TEXT NOT NULL,          -- full JSON: diet, exercise, sleep, lifestyle
    model_used      TEXT NOT NULL DEFAULT 'Gemini 2.5 Flash',
    based_on        TEXT,                   -- condition names snapshot used to generate
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_plan_patient ON health_plan_cache(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_plan_date    ON health_plan_cache(patient_id, generated_at DESC);

-- ============================================================
-- DONE — all tables created.
-- Next steps:
--   1. Copy backend/.env → set DATABASE_URL to Supabase connection string
--   2. Set GEMINI_API_KEY and GROQ_API_KEY
--   3. Run: uvicorn main:app --reload
-- AI Stack: Gemini 2.5 Flash (patient AI) + Groq Llama-3.3 (doctor AI)
--           Health Agent: Gemini 2.5 Flash  (diet / exercise / sleep / lifestyle)
-- ============================================================
