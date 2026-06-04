"""
MediTrace — Database connection + session management
Supports SQLite (dev) and PostgreSQL / Supabase (production)
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from pydantic_settings import BaseSettings
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./meditrace.db"
    gemini_api_key: str = ""
    groq_api_key: str = ""
    openai_api_key: str = ""   # kept for backward compat, not used by AI features
    secret_key: str = "change-me-in-production"
    app_name: str = "MediTrace"
    app_version: str = "1.0.0"
    debug: bool = True
    allowed_origins: str = "http://localhost:3000"
    rate_limit_per_minute: int = 100
    upload_limit_per_hour: int = 10
    ai_agent_limit_per_minute: int = 5

    # Supabase (optional — used for direct API calls / realtime)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def _normalise_db_url(url: str) -> str:
    """
    SQLAlchemy async drivers require specific scheme prefixes:
      SQLite   → sqlite+aiosqlite://
      Postgres → postgresql+asyncpg://

    Supabase/Railway often hand out plain postgres:// or postgresql:// URLs —
    fix those so asyncpg is used and SSL is embedded in the URL.
    """
    # Heroku / Supabase shorthand
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    # Add asyncpg driver if not already present
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return url


def _make_engine(db_url: str):
    """Create async SQLAlchemy engine with correct driver settings."""
    db_url = _normalise_db_url(db_url)

    if db_url.startswith("sqlite"):
        # SQLite: StaticPool + check_same_thread for dev convenience
        return create_async_engine(
            db_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False,
        )
    else:
        # PostgreSQL / Supabase — asyncpg, SSL required, connection pooling
        return create_async_engine(
            db_url,
            echo=False,
            pool_pre_ping=True,   # detect dropped connections
            pool_size=5,          # Supabase free tier limit
            max_overflow=10,
            connect_args={
                "ssl": "require",  # Supabase requires SSL (asyncpg syntax)
            },
        )


settings = get_settings()
engine = _make_engine(settings.database_url)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables on startup."""
    from models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created / verified.")
