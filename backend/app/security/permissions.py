"""
FastAPI dependency functions for authentication and role-based access control.

Usage in route handlers:
    current_user: User = Depends(get_current_user)   # any authenticated user
    current_user: User = Depends(require_editor)      # editor or admin
    current_user: User = Depends(require_admin)       # admin only
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, UserRole
from app.security.auth import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency: extract and validate the JWT from the Authorization header.

    Raises HTTP 401 if the token is missing, invalid, expired, or the user
    no longer exists or is deactivated.

    Returns the authenticated User ORM object.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: int = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency: require the current user to have the 'admin' role.

    Raises HTTP 403 for any authenticated non-admin user.
    """
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def require_editor(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency: require the current user to have 'editor' or 'admin' role.

    Raises HTTP 403 for viewer-role users.
    """
    if current_user.role not in [UserRole.admin, UserRole.editor]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor access required"
        )
    return current_user
