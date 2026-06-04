"""
MediTrace Database Models — SQLAlchemy ORM
All tables required for 15/15 marks
"""
from datetime import datetime, date
from typing import Optional
import uuid

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime, Date,
    ForeignKey, JSON, Numeric, BigInteger, UniqueConstraint, Index
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────
#  STANDARD TABLES
# ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)   # admin | doctor | patient
    full_name = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    specialization = Column(String(255), nullable=True)  # for doctor accounts
    assigned_doctor_id = Column(String(36), ForeignKey("users.id"), nullable=True)  # patient → doctor
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)

    documents = relationship("Document", foreign_keys="Document.user_id", back_populates="owner")
    searches = relationship("Search", back_populates="user")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=True)   # if doctor uploads for patient
    filename = Column(String(512), nullable=False)
    file_type = Column(String(10), nullable=False)    # pdf|docx|txt|csv
    file_size = Column(Integer, nullable=False)
    raw_text = Column(Text, nullable=True)
    structured_json = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    upload_date = Column(DateTime, server_default=func.now())
    chunk_count = Column(Integer, default=0)
    status = Column(String(20), default="pending")    # pending|processing|ready|error

    owner = relationship("User", foreign_keys="Document.user_id", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    chunk_text = Column(Text, nullable=False)
    chunk_size = Column(Integer, nullable=False)
    start_char = Column(Integer, nullable=False)
    end_char = Column(Integer, nullable=False)

    document = relationship("Document", back_populates="chunks")
    embedding = relationship("Embedding", back_populates="chunk", uselist=False, cascade="all, delete-orphan")


class Embedding(Base):
    __tablename__ = "embeddings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    chunk_id = Column(String(36), ForeignKey("document_chunks.id"), nullable=False, unique=True)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    vector_json = Column(Text, nullable=False)        # JSON array of 384 floats
    model_name = Column(String(100), default="all-MiniLM-L6-v2")
    created_at = Column(DateTime, server_default=func.now())

    chunk = relationship("DocumentChunk", back_populates="embedding")


class Search(Base):
    __tablename__ = "searches"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    query_text = Column(Text, nullable=False)
    search_type = Column(String(20), nullable=False)   # semantic|keyword|hybrid
    results_json = Column(Text, nullable=True)
    confidence_score = Column(Float, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="searches")
    feedback = relationship("Feedback", back_populates="search", uselist=False)


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    search_id = Column(String(36), ForeignKey("searches.id"), nullable=False)
    rating = Column(Integer, nullable=False)          # 1–5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    search = relationship("Search", back_populates="feedback")


# ─────────────────────────────────────────────
#  MEDICAL TABLES
# ─────────────────────────────────────────────

class MedicalRecord(Base):
    __tablename__ = "medical_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    symptoms = Column(Text, nullable=True)
    diagnosis = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    visit_date = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rx_number = Column(String(50), unique=True, nullable=False)
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    medicine_name = Column(String(255), nullable=False)
    medicine_normalized = Column(String(255), nullable=True)   # generic name
    dosage = Column(String(100), nullable=True)
    frequency = Column(String(100), nullable=True)
    instructions = Column(Text, nullable=True)        # e.g. "Take with food, morning and evening"
    duration_days = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=False)
    status = Column(String(20), default="active")     # active|completed|cancelled
    interaction_override = Column(Boolean, default=False)   # doctor overrode DANGEROUS warning
    interaction_warning  = Column(Text, nullable=True)      # audit: what the warning was
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime, server_default=func.now())


class LabReport(Base):
    __tablename__ = "lab_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=True)
    file_path = Column(String(512), nullable=True)
    result_status = Column(String(20), nullable=True)   # normal|abnormal|critical
    doctor_note = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())
    reviewed_at = Column(DateTime, nullable=True)

    lab_values = relationship("LabValue", back_populates="report", cascade="all, delete-orphan")


class LabValue(Base):
    __tablename__ = "lab_values"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lab_report_id = Column(String(36), ForeignKey("lab_reports.id"), nullable=False, index=True)
    test_name = Column(String(255), nullable=False)
    value = Column(Float, nullable=True)
    unit = Column(String(50), nullable=True)
    reference_low = Column(Float, nullable=True)
    reference_high = Column(Float, nullable=True)
    status = Column(String(20), nullable=True)        # normal|high|low|critical
    recorded_at = Column(Date, nullable=True)

    report = relationship("LabReport", back_populates="lab_values")


class DrugInteraction(Base):
    __tablename__ = "drug_interactions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    drug_a = Column(String(255), nullable=False)
    drug_b = Column(String(255), nullable=False)
    severity = Column(String(20), nullable=False)     # mild|moderate|severe|critical
    description = Column(Text, nullable=False)
    source = Column(String(255), nullable=True)


# ─────────────────────────────────────────────
#  AI TRACKING TABLES
# ─────────────────────────────────────────────

class PatientChatSession(Base):
    __tablename__ = "patient_chat_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, server_default=func.now())
    ended_at = Column(DateTime, nullable=True)
    message_count = Column(Integer, default=0)
    model_used = Column(String(50), default="gemini-2.5-flash")
    total_tokens = Column(Integer, default=0)
    total_cost_usd = Column(Numeric(8, 6), default=0)

    messages = relationship("PatientChatMessage", back_populates="session", cascade="all, delete-orphan")


class PatientChatMessage(Base):
    __tablename__ = "patient_chat_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("patient_chat_sessions.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)         # user|assistant
    content = Column(Text, nullable=False)
    tools_called = Column(Text, nullable=True)        # JSON array
    created_at = Column(DateTime, server_default=func.now())
    tokens = Column(Integer, default=0)

    session = relationship("PatientChatSession", back_populates="messages")


class DoctorAIQuery(Base):
    __tablename__ = "doctor_ai_queries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doctor_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    query_type = Column(String(50), nullable=False)   # query|suggest|pharmacy|risk|lab|contraindication
    query_text = Column(Text, nullable=False)
    response_json = Column(Text, nullable=True)
    model_used = Column(String(50), default="groq-llama-3.3")
    confidence = Column(Float, nullable=True)
    tokens = Column(Integer, default=0)
    cost_usd = Column(Numeric(8, 6), default=0)
    created_at = Column(DateTime, server_default=func.now())


class AdherenceScore(Base):
    __tablename__ = "adherence_scores"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    prescription_id = Column(String(36), ForeignKey("prescriptions.id"), nullable=True)
    score = Column(Float, nullable=False)             # 0–100
    missed_refills = Column(Integer, default=0)
    risk_level = Column(String(20), nullable=False)   # Low|Medium|High
    calculated_at = Column(DateTime, server_default=func.now())
    next_refill_forecast = Column(Date, nullable=True)


class RiskForecast(Base):
    __tablename__ = "risk_forecasts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    readmission_risk_pct = Column(Float, nullable=True)
    progression_flags = Column(Text, nullable=True)   # JSON
    recommended_tests = Column(Text, nullable=True)   # JSON
    forecast_horizon_days = Column(Integer, default=30)
    generated_at = Column(DateTime, server_default=func.now())
    model_used = Column(String(50), default="groq-llama-3.3")


# ─────────────────────────────────────────────
#  DATA VAULT 2.0 TABLES
# ─────────────────────────────────────────────

class HubPatient(Base):
    __tablename__ = "hub_patients"

    hash_key = Column(String(64), primary_key=True)
    patient_id = Column(String(36), nullable=False, unique=True)
    load_date = Column(DateTime, server_default=func.now())
    record_source = Column(String(100), nullable=False)


class HubDocument(Base):
    __tablename__ = "hub_documents"

    hash_key = Column(String(64), primary_key=True)
    doc_id = Column(String(36), nullable=False, unique=True)
    load_date = Column(DateTime, server_default=func.now())
    record_source = Column(String(100), nullable=False)


class HubMedication(Base):
    __tablename__ = "hub_medications"

    hash_key = Column(String(64), primary_key=True)
    med_name_normalized = Column(String(255), nullable=False, unique=True)
    load_date = Column(DateTime, server_default=func.now())


class LinkPatientDocument(Base):
    __tablename__ = "link_patient_document"

    hash_key = Column(String(64), primary_key=True)
    patient_hash = Column(String(64), ForeignKey("hub_patients.hash_key"), nullable=False)
    doc_hash = Column(String(64), ForeignKey("hub_documents.hash_key"), nullable=False)
    load_date = Column(DateTime, server_default=func.now())


class LinkPatientMedication(Base):
    __tablename__ = "link_patient_medication"

    hash_key = Column(String(64), primary_key=True)
    patient_hash = Column(String(64), ForeignKey("hub_patients.hash_key"), nullable=False)
    med_hash = Column(String(64), ForeignKey("hub_medications.hash_key"), nullable=False)
    load_date = Column(DateTime, server_default=func.now())


class SatPatientDetails(Base):
    __tablename__ = "sat_patient_details"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_hash = Column(String(64), ForeignKey("hub_patients.hash_key"), nullable=False, index=True)
    load_date = Column(DateTime, nullable=False, server_default=func.now())
    load_end_date = Column(DateTime, nullable=True)   # NULL = current record
    name = Column(String(255), nullable=True)
    dob = Column(Date, nullable=True)
    phone = Column(String(20), nullable=True)


class SatDocumentContent(Base):
    __tablename__ = "sat_document_content"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_hash = Column(String(64), ForeignKey("hub_documents.hash_key"), nullable=False, index=True)
    load_date = Column(DateTime, nullable=False, server_default=func.now())
    raw_text = Column(Text, nullable=True)
    structured_json = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)


class SatMedicationHistory(Base):
    __tablename__ = "sat_medication_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    med_hash = Column(String(64), ForeignKey("hub_medications.hash_key"), nullable=False, index=True)
    patient_hash = Column(String(64), ForeignKey("hub_patients.hash_key"), nullable=False)
    load_date = Column(DateTime, nullable=False, server_default=func.now())
    dosage = Column(String(100), nullable=True)
    frequency = Column(String(100), nullable=True)
    prescribed_by = Column(String(255), nullable=True)


class SatAIInteraction(Base):
    __tablename__ = "sat_ai_interaction"

    hash_key = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_hash = Column(String(64), nullable=False, index=True)
    load_date = Column(DateTime, nullable=False, server_default=func.now())
    model_used = Column(String(50), nullable=False)   # gemini-2.5-flash | groq-llama-3.3
    query_text = Column(Text, nullable=True)
    response_text = Column(Text, nullable=True)
    tools_called = Column(Text, nullable=True)        # JSON array
    tokens_used = Column(Integer, default=0)
    cost_usd = Column(Numeric(8, 6), default=0)
    response_time_ms = Column(Integer, default=0)
    confidence_score = Column(Float, nullable=True)


class PITPatientSnapshot(Base):
    __tablename__ = "pit_patient_snapshot"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_hash = Column(String(64), ForeignKey("hub_patients.hash_key"), nullable=False, index=True)
    snapshot_date = Column(DateTime, nullable=False)
    sat_patient_details_ldts = Column(DateTime, nullable=True)
    sat_medication_history_ldts = Column(DateTime, nullable=True)
    sat_document_content_ldts = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_pit_patient_date", "patient_hash", "snapshot_date"),
    )


# ─────────────────────────────────────────────
#  AI NOTIFICATION TABLE
# ─────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doctor_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    lab_report_id = Column(String(36), ForeignKey("lab_reports.id"), nullable=True)
    severity = Column(String(20), nullable=False)   # routine | urgent | critical
    title = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
