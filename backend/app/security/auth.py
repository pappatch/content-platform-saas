"""
Authentication helpers: password hashing and JWT creation / verification.

SECURITY INVARIANTS
-------------------
- Passwords are hashed with bcrypt via passlib; plain-text passwords are
  never stored.
- JWTs are signed with HMAC-SHA256 (HS256).  The algorithm is pinned in
  jwt.decode(algorithms=[settings.algorithm]) so the 'none' algorithm
  attack is impossible — python-jose rejects tokens signed with 'none'
  when an explicit algorithms list is provided.
- Token expiry is enforced by the 'exp' claim; expired tokens are rejected
  by decode_access_token which returns None.
- The secret_key is read from Settings (environment variable) only.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import get_settings

settings = get_settings()

# bcrypt password hashing context — 'deprecated="auto"' migrates old hashes.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password* suitable for DB storage."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if *plain_password* matches the stored bcrypt *hashed_password*."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT containing *data* plus an 'exp' claim.

    The token is signed with settings.secret_key using settings.algorithm
    (default HS256).  Expiry defaults to settings.access_token_expire_minutes.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT.

    Returns the payload dict on success, or None if the token is invalid,
    expired, or signed with an unexpected algorithm.

    SECURITY: algorithms is an explicit list — the 'none' algorithm attack
    is not possible because python-jose will reject it.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None
