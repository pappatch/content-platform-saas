"""
Platform Settings routes.

GET   /settings        — list all platform settings (admin only)
PATCH /settings/{key}  — update a single setting value (admin only)

All routes require the admin role.  Settings are operational parameters
that affect core platform behaviour — exposing them to editors or viewers
would be a privilege escalation.

Security notes
--------------
- Value type validation is performed in settings_service.set_value() before
  any DB write, so invalid float/int/bool strings are rejected with 422.
- The key must be a known platform setting; unknown keys return 404.
- updated_by_id is set to the authenticated user's ID on every PATCH so
  the audit trail always shows who changed what.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.user import User
from app.schemas.settings import PlatformSettingResponse, PlatformSettingUpdate
from app.security.permissions import require_admin
from app.services import settings_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["Settings"])


# ---------------------------------------------------------------------------
# GET /settings
# ---------------------------------------------------------------------------

@router.get("", response_model=List[PlatformSettingResponse])
def list_settings(current_user: User = Depends(require_admin)):
    """
    Return all platform settings ordered by key.

    Response fields per setting:
    - key          : snake_case identifier
    - value        : current string-encoded value
    - value_type   : "float" | "int" | "bool" | "string"
    - description  : human-readable explanation shown in the admin UI
    - updated_by_id: ID of the last editor (null = system default)
    - updated_at   : ISO-8601 timestamp of last change (null = never changed)
    """
    return settings_service.get_all()


# ---------------------------------------------------------------------------
# PATCH /settings/{key}
# ---------------------------------------------------------------------------

@router.patch("/{key}", response_model=PlatformSettingResponse)
def update_setting(
    key: str,
    body: PlatformSettingUpdate,
    current_user: User = Depends(require_admin),
):
    """
    Update a single platform setting.

    The new value is validated against the key's declared value_type before
    being written to the database.  The in-memory settings cache is
    invalidated immediately so the change takes effect without a restart.

    Args:
        key:  Snake_case setting key (must be a known platform setting).
        body: JSON body with a single "value" string field.

    Raises:
        404: If *key* is not a known platform setting.
        422: If *body.value* cannot be cast to the key's declared type.
    """
    try:
        row = settings_service.set_value(
            key,
            value=body.value,
            updated_by_id=current_user.id,
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown setting key: {key!r}",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    return row
