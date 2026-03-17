"""
Admin docs routes — serve project and global documentation files for in-app viewing.

Routes
------
GET /admin/docs/{filename}
    Returns CLAUDE.md or REVIEW.md from the project root.

GET /admin/docs/project/{filepath}
    Returns a file from the project's .claude/ directory
    (hooks, skills, commands).

GET /admin/docs/global/{filepath}
    Returns a file from the user's global ~/.claude/ directory
    (universal CLAUDE.md, global hooks, skills, commands).

Security invariants
-------------------
- All routes require admin role (require_admin dependency).
- Strict allowlists on every route — no arbitrary path traversal.
- File paths are resolved from __file__ or Path.home() (constants),
  never from raw user input.
- filepath values are checked against the allowlist before any I/O.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.models.user import User
from app.security.permissions import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/docs", tags=["Admin — Docs"])

# Project root: 4 levels above this file (backend/app/routes/admin/docs.py → platform/)
_PROJECT_ROOT = Path(__file__).resolve().parents[4]

# Global Claude config root
_GLOBAL_ROOT = Path.home() / ".claude"

# Strict allowlist for project-root docs
_ALLOWED_FILES = {"CLAUDE.md", "REVIEW.md"}

# Strict allowlist for .claude/ project files (relative to .claude/)
_ALLOWED_PROJECT_DOCS = {
    "hooks/pre-task.md",
    "hooks/post-task.md",
    "hooks/pre-commit.md",
    "skills/code-review.md",
    "skills/doc-sync.md",
    "skills/image-fix.md",
    "skills/session-handoff.md",
    "commands/scrape.md",
    "commands/review.md",
    "commands/newsite.md",
    "commands/stats.md",
    "commands/deploy.md",
    "commands/trends.md",
    "commands/api-costs.md",
    "commands/refactor.md",
}

# Strict allowlist for ~/.claude/ global files (relative to ~/.claude/)
_ALLOWED_GLOBAL_DOCS = {
    "CLAUDE.md",
    "commands/pre-task.md",
    "commands/post-task.md",
    "commands/pre-commit.md",
    "commands/code-review.md",
    "commands/doc-sync.md",
    "commands/image-fix.md",
    "commands/session-handoff.md",
    "commands/new-project.md",
    "hooks/pre-task.md",
    "hooks/post-task.md",
    "hooks/pre-commit.md",
    "skills/code-review.md",
    "skills/doc-sync.md",
    "skills/image-fix.md",
    "skills/session-handoff.md",
}


def _read_file(path: Path, label: str) -> str:
    """Read a text file, raising appropriate HTTP exceptions on failure."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"{label} not found on disk")
    except Exception as exc:
        logger.warning("docs: failed to read %s: %s", label, exc)
        raise HTTPException(status_code=500, detail="Failed to read file")


@router.get("/{filename}")
async def get_doc(
    filename: str,
    current_user: User = Depends(require_admin),
):
    """Return CLAUDE.md or REVIEW.md from the project root."""
    if filename not in _ALLOWED_FILES:
        raise HTTPException(status_code=404, detail="File not found")
    content = _read_file(_PROJECT_ROOT / filename, filename)
    return {"filename": filename, "content": content}


@router.get("/project/{filepath:path}")
async def get_project_doc(
    filepath: str,
    current_user: User = Depends(require_admin),
):
    """
    Return a file from the project's .claude/ directory.

    filepath must be one of the entries in _ALLOWED_PROJECT_DOCS
    (e.g. 'hooks/pre-task.md', 'skills/code-review.md').
    """
    if filepath not in _ALLOWED_PROJECT_DOCS:
        raise HTTPException(status_code=404, detail="File not found")
    path = _PROJECT_ROOT / ".claude" / filepath
    content = _read_file(path, filepath)
    return {"filename": filepath, "content": content}


@router.get("/global/{filepath:path}")
async def get_global_doc(
    filepath: str,
    current_user: User = Depends(require_admin),
):
    """
    Return a file from the user's global ~/.claude/ directory.

    filepath must be one of the entries in _ALLOWED_GLOBAL_DOCS
    (e.g. 'CLAUDE.md', 'commands/code-review.md').
    """
    if filepath not in _ALLOWED_GLOBAL_DOCS:
        raise HTTPException(status_code=404, detail="File not found")
    path = _GLOBAL_ROOT / filepath
    content = _read_file(path, filepath)
    return {"filename": filepath, "content": content}
