"""
MediTrace — Embedding engine (sentence-transformers, local, free)
Model: all-MiniLM-L6-v2 — 384 dimensions, CPU-only
"""
import json
import logging
import numpy as np
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_embedding_model():
    """Load sentence-transformers model once and cache it."""
    from sentence_transformers import SentenceTransformer
    logger.info("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("Embedding model loaded.")
    return model


def embed_chunks(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of text strings.
    Returns: list of 384-dim float vectors.
    """
    if not texts:
        return []
    model = get_embedding_model()
    vectors = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return [v.tolist() for v in vectors]


def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    return embed_chunks([query])[0]


def cosine_similarity_np(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors using numpy."""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def batch_cosine_similarity(query_vec: list[float], vectors: list[list[float]]) -> list[float]:
    """
    Efficiently compute cosine similarity of one query against many vectors.
    Returns list of similarity scores in the same order.
    """
    if not vectors:
        return []
    q = np.array(query_vec, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm == 0:
        return [0.0] * len(vectors)

    matrix = np.array(vectors, dtype=np.float32)        # shape: (N, 384)
    norms = np.linalg.norm(matrix, axis=1)              # shape: (N,)
    norms[norms == 0] = 1e-8                             # prevent div-by-zero
    dots = matrix.dot(q)                                 # shape: (N,)
    scores = dots / (norms * q_norm)
    return scores.tolist()
