"""
MediTrace — Full JWT Authentication + Role-Based Access Control
Covers the 1 mark for Auth + 1 mark for RBAC
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db, get_settings
from models import User

logger = logging.getLogger(__name__)
settings = get_settings()

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─────────────────────────────────────────────
#  PYDANTIC SCHEMAS
# ─────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        if not re.match(r"[^@]+@[^@]+\.[^@]+", v):
            raise ValueError("Invalid email address")
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in ("admin", "doctor", "patient"):
            raise ValueError("Role must be admin, doctor, or patient")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    full_name: Optional[str] = None


class UserProfile(BaseModel):
    id: str
    email: str
    role: str
    full_name: Optional[str]
    phone: Optional[str]
    created_at: datetime
    is_active: bool


# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": user_id, "role": role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency — decode JWT and return the User row."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return user


def require_role(*roles: str):
    """Role guard factory — usage: Depends(require_role('doctor', 'admin'))"""
    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return current_user
    return _guard


# ─────────────────────────────────────────────
#  SEED DEFAULT ACCOUNTS
# ─────────────────────────────────────────────
async def seed_default_users(db: AsyncSession):
    """Create default test accounts on startup if they don't exist."""
    defaults = [
        {"email": "admin@meditrace.com",   "password": "admin123", "role": "admin",   "full_name": "System Admin"},
        {"email": "doctor@meditrace.com",  "password": "dr001",    "role": "doctor",  "full_name": "Dr. Ahmad Khan"},
        {"email": "patient@meditrace.com", "password": "pt001",    "role": "patient", "full_name": "Ali Raza (PT-001)"},
    ]
    for d in defaults:
        result = await db.execute(select(User).where(User.email == d["email"]))
        existing = result.scalar_one_or_none()
        if not existing:
            user = User(
                id=str(uuid.uuid4()),
                email=d["email"],
                password_hash=hash_password(d["password"]),
                role=d["role"],
                full_name=d["full_name"],
            )
            db.add(user)
    await db.commit()
    logger.info("Default users seeded.")


# ─────────────────────────────────────────────
#  ENDPOINTS
# ─────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user. Returns JWT on success."""
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        full_name=body.full_name,
        phone=body.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user. Returns JWT on success."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    token = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return current user profile."""
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        full_name=current_user.full_name,
        phone=current_user.phone,
        created_at=current_user.created_at,
        is_active=current_user.is_active,
    )
