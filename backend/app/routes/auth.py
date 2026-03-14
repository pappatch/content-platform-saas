"""
Authentication routes: register, login, and /me.

POST /auth/register — create a new viewer-role account
POST /auth/login    — authenticate and receive a JWT
GET  /auth/me       — return the currently authenticated user's profile
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.security.auth import hash_password, verify_password, create_access_token
from app.security.permissions import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user account.

    The role field in the request body is intentionally ignored so that
    self-registration can never produce an admin or editor account.
    All self-registered users receive the 'viewer' role.  Admins can
    upgrade roles via PATCH /admin/users/{id}.

    SECURITY NOTE: If you want to allow trusted callers to set arbitrary
    roles (e.g. a CLI seed script), gate this endpoint behind
    require_admin and remove this override.
    """
    # Check that the email is not already registered
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    # SECURITY: force viewer role regardless of what was submitted —
    # prevents privilege escalation via self-registration.
    user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=UserRole.viewer,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """התחברות וקבלת JWT token"""
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """מחזיר פרטי המשתמש המחובר"""
    return current_user
