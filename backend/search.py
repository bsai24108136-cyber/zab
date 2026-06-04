"""
MediTrace — Smart Search Router
Covers: Semantic search (1 mark) + Smart hybrid search (1 mark)
Hybrid formula: 0.4 × keyword_score + 0.6 × semantic_score
"""
import json
import time
import uuid
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from auth import get_current_user
from database import get_db
from models import User, Document, DocumentChunk, Embedding, Search, Feedback
from embeddings import embed_query, batch_cosine_similarity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["Search"])


# ─────────────────────────────────────────────
#  SCHEMAS
# ─────────────────────────────────────────────
class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    patient_id: str | None = None


class HybridSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=10, ge=1, le=20)
    patient_id: str | None = None


class RateSearchRequest(BaseModel):
    search_id: str
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


# ─────────────────────────────────────────────
#  HELPER: load embeddings for user
# ─────────────────────────────────────────────
async def _load_user_embeddings(user: User, db: AsyncSession, patient_id: str | None = None):
    """
    Load all embeddings accessible to this user.
    Returns list of dicts: {chunk_id, chunk_text, document_id, filename, chunk_index, vector}
    Row-level security applied here.
    """
    if user.role == "admin":
        # Admin sees everything
        result = await db.execute(
            select(Embedding, DocumentChunk, Document)
            .join(DocumentChunk, Embedding.chunk_id == DocumentChunk.id)
            .join(Document, Embedding.document_id == Document.id)
        )
    elif user.role == "doctor":
        if patient_id:
            result = await db.execute(
                select(Embedding, DocumentChunk, Document)
                .join(DocumentChunk, Embedding.chunk_id == DocumentChunk.id)
                .join(Document, Embedding.document_id == Document.id)
                .where(Document.patient_id == patient_id)
                .where(Document.user_id == user.id)
            )
        else:
            result = await db.execute(
                select(Embedding, DocumentChunk, Document)
                .join(DocumentChunk, Embedding.chunk_id == DocumentChunk.id)
                .join(Document, Embedding.document_id == Document.id)
                .where(Document.user_id == user.id)
            )
    else:
        # patient — only their own docs
        result = await db.execute(
            select(Embedding, DocumentChunk, Document)
            .join(DocumentChunk, Embedding.chunk_id == DocumentChunk.id)
            .join(Document, Embedding.document_id == Document.id)
            .where(Document.patient_id == user.id)
        )

    rows = result.all()
    items = []
    for emb, chunk, doc in rows:
        try:
            vector = json.loads(emb.vector_json)
        except Exception:
            continue
        items.append({
            "chunk_id": chunk.id,
            "chunk_text": chunk.chunk_text,
            "chunk_index": chunk.chunk_index,
            "document_id": doc.id,
            "filename": doc.filename,
            "upload_date": doc.upload_date,
            "vector": vector,
        })
    return items


def _keyword_score(text: str, query: str) -> float:
    """Simple normalized keyword match score (0–1)."""
    terms = query.lower().split()
    if not terms:
        return 0.0
    text_lower = text.lower()
    matched = sum(1 for t in terms if t in text_lower)
    return matched / len(terms)


def _highlight(text: str, query: str) -> str:
    """Wrap matched query terms with ** for frontend highlighting."""
    import re
    for term in query.split():
        if len(term) > 2:
            text = re.sub(
                re.escape(term), f"**{term}**", text, flags=re.IGNORECASE
            )
    return text


async def _save_search(
    user: User, db: AsyncSession, query: str, search_type: str,
    results: list, confidence: float, response_time_ms: int
) -> str:
    """Persist search record. Returns search_id."""
    search = Search(
        id=str(uuid.uuid4()),
        user_id=user.id,
        query_text=query,
        search_type=search_type,
        results_json=json.dumps(results[:5]),   # store top-5 only
        confidence_score=confidence,
        response_time_ms=response_time_ms,
    )
    db.add(search)
    await db.commit()
    return search.id


# ─────────────────────────────────────────────
#  SEMANTIC SEARCH
# ─────────────────────────────────────────────
@router.post("/semantic")
async def semantic_search(
    body: SemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t0 = time.time()
    items = await _load_user_embeddings(current_user, db, body.patient_id)

    if not items:
        return {"results": [], "search_id": None, "message": "No documents indexed yet."}

    query_vec = embed_query(body.query)
    vectors = [i["vector"] for i in items]
    scores = batch_cosine_similarity(query_vec, vectors)

    ranked = sorted(zip(scores, items), key=lambda x: x[0], reverse=True)
    top = ranked[: body.top_k]

    results = [
        {
            "chunk_text": item["chunk_text"],
            "source_document": item["filename"],
            "document_id": item["document_id"],
            "page_or_chunk_number": item["chunk_index"] + 1,
            "confidence_score": round(score * 100, 1),
            "upload_date": item["upload_date"].isoformat() if item["upload_date"] else None,
            "match_type": "semantic",
        }
        for score, item in top
        if score > 0.1
    ]

    elapsed = int((time.time() - t0) * 1000)
    avg_conf = (sum(r["confidence_score"] for r in results) / len(results)) if results else 0
    search_id = await _save_search(current_user, db, body.query, "semantic", results, avg_conf, elapsed)

    return {
        "results": results,
        "search_id": search_id,
        "response_time_ms": elapsed,
    }


# ─────────────────────────────────────────────
#  HYBRID SEARCH
# ─────────────────────────────────────────────
@router.post("/hybrid")
async def hybrid_search(
    body: HybridSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t0 = time.time()
    items = await _load_user_embeddings(current_user, db, body.patient_id)

    if not items:
        return {"results": [], "search_id": None, "message": "No documents indexed yet."}

    query_vec = embed_query(body.query)
    vectors = [i["vector"] for i in items]
    sem_scores = batch_cosine_similarity(query_vec, vectors)
    kw_scores = [_keyword_score(i["chunk_text"], body.query) for i in items]

    combined = []
    for i, item in enumerate(items):
        sem = sem_scores[i]
        kw = kw_scores[i]
        final = 0.4 * kw + 0.6 * sem

        if sem > 0.05 or kw > 0:
            match_type = (
                "hybrid" if (sem > 0.1 and kw > 0)
                else "semantic" if sem > 0.1
                else "keyword"
            )
            combined.append((final, item, sem, kw, match_type))

    ranked = sorted(combined, key=lambda x: x[0], reverse=True)[: body.top_k]

    results = [
        {
            "chunk_text": _highlight(item["chunk_text"], body.query),
            "source_document": item["filename"],
            "document_id": item["document_id"],
            "page_or_chunk_number": item["chunk_index"] + 1,
            "confidence_score": round(final_score * 100, 1),
            "semantic_score": round(sem * 100, 1),
            "keyword_score": round(kw * 100, 1),
            "match_type": match_type,
            "upload_date": item["upload_date"].isoformat() if item["upload_date"] else None,
        }
        for final_score, item, sem, kw, match_type in ranked
    ]

    elapsed = int((time.time() - t0) * 1000)
    avg_conf = (sum(r["confidence_score"] for r in results) / len(results)) if results else 0
    search_id = await _save_search(current_user, db, body.query, "hybrid", results, avg_conf, elapsed)

    return {
        "results": results,
        "search_id": search_id,
        "response_time_ms": elapsed,
    }


# ─────────────────────────────────────────────
#  RATE SEARCH
# ─────────────────────────────────────────────
@router.post("/rate")
async def rate_search(
    body: RateSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Search).where(Search.id == body.search_id))
    search = result.scalar_one_or_none()
    if not search or search.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Search not found")

    # Upsert feedback
    fb_result = await db.execute(
        select(Feedback).where(
            Feedback.search_id == body.search_id,
            Feedback.user_id == current_user.id,
        )
    )
    fb = fb_result.scalar_one_or_none()
    if fb:
        fb.rating = body.rating
        fb.comment = body.comment
    else:
        fb = Feedback(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            search_id=body.search_id,
            rating=body.rating,
            comment=body.comment,
        )
        db.add(fb)

    await db.commit()
    return {"message": "Rating saved", "rating": body.rating}


# ─────────────────────────────────────────────
#  SEARCH HISTORY
# ─────────────────────────────────────────────
@router.get("/history")
async def search_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        result = await db.execute(
            select(Search, Feedback)
            .outerjoin(Feedback, Search.id == Feedback.search_id)
            .order_by(Search.created_at.desc())
            .limit(100)
        )
    else:
        result = await db.execute(
            select(Search, Feedback)
            .outerjoin(Feedback, Search.id == Feedback.search_id)
            .where(Search.user_id == current_user.id)
            .order_by(Search.created_at.desc())
            .limit(100)
        )

    rows = result.all()
    return [
        {
            "id": s.id,
            "query_text": s.query_text,
            "search_type": s.search_type,
            "confidence_score": s.confidence_score,
            "response_time_ms": s.response_time_ms,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "rating": f.rating if f else None,
        }
        for s, f in rows
    ]
