"""
Admin docs route — serves project documentation files for in-app viewing.

GET /admin/docs/{filename}
    Returns the raw text content of CLAUDE.md or REVIEW.md from the
    project root so that the Architecture Guidelines tab can display
    them inline without filesystem access from the browser.

Security invariants
-------------------
- Requires admin role (enforced by require_admin dependency).
- Strict filename allowlist prevents path traversal — only
  CLAUDE.md and REVIEW.md are served; any other value returns 404.
- File path is constructed from __file__ (not from user input) so
  there is no injection risk.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.models.user import User
from app.security.permissions import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/docs", tags=["Admin — Docs"])

# Project root is 4 directories above this file:
#   backend/app/routes/admin/docs.py  →  platform/
_PROJECT_ROOT = Path(__file__).resolve().parents[4]

# Strict allowlist — never serve arbitrary paths
_ALLOWED_FILES = {"CLAUDE.md", "REVIEW.md"}


@router.get("/{filename}")
async def get_doc(
    filename: str,
    current_user: User = Depends(require_admin),
):
    """
    Return the raw text content of a project documentation file.

    Only CLAUDE.md and REVIEW.md are served.  Any other filename
    returns 404.  The file is read from the project root directory.
    """
    if filename not in _ALLOWED_FILES:
        raise HTTPException(status_code=404, detail="File not found")

    path = _PROJECT_ROOT / filename
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"{filename} not found on disk")
    except Exception as exc:
        logger.warning("get_doc: failed to read %s: %s", filename, exc)
        raise HTTPException(status_code=500, detail="Failed to read file")

    return {"filename": filename, "content": content}
