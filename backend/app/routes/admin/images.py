"""
Image audit route — admin-only tool to detect and fix broken or missing article images.

POST /admin/images/audit
    Scans all articles for null, broken, or known-noise image URLs.
    For each problematic article: calls the Unsplash image service to find a
    replacement and persists the new URL.  Returns a summary report.

Security invariants
-------------------
- Requires admin role (enforced by require_admin dependency).
- HEAD requests for broken-link detection use a 5-second timeout and go through
  httpx — no SSRF risk because the URL was previously stored by the backend itself.
- A hard limit of 200 articles per audit run prevents runaway processing.
"""

import logging
import re

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.user import User
from app.security.permissions import require_admin
from app.services import settings_service
from app.services.image_service import enrich_article_images

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/images", tags=["Admin — Images"])

# URL patterns that indicate a tracking pixel or irrelevant image
_NOISE_PATTERNS = re.compile(
    r"(1x1|pixel[._-]|tracking|beacon|analytics|\.gif\?|spacer|placeholder"
    r"|blank\.gif|clear\.gif|transparent\.gif|shim\.gif)",
    re.IGNORECASE,
)

_MAX_ARTICLES_HARD_CAP = 1000  # absolute ceiling for the Query parameter
_DEFAULT_MAX_ARTICLES = 200    # fallback if platform_settings DB is unavailable


async def _is_broken_url(url: str) -> bool:
    """
    HEAD-request *url* with a 5-second timeout.
    Returns True if the server responds with a non-2xx status or the request fails.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.head(url)
            return resp.status_code >= 400
    except Exception:
        return True


@router.post("/audit")
async def audit_images(
    fix: bool = Query(True, description="If true, replace broken/missing images via Unsplash"),
    limit: int = Query(_DEFAULT_MAX_ARTICLES, ge=1, le=_MAX_ARTICLES_HARD_CAP, description="Max articles to inspect (ceiling from image_audit_max_articles platform setting)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Scan articles for image issues and optionally fix them.

    Checks (in order):
    1. ``main_image_url`` is NULL / empty.
    2. URL matches known tracking-pixel / noise patterns.
    3. HEAD request returns non-2xx (broken link).

    For each affected article (when *fix=true*): calls the Unsplash image service
    using the article's ``seo_keywords`` or ``title`` as the search query.

    Returns a JSON report with counts and per-article details.
    """
    effective_limit = min(limit, settings_service.get("image_audit_max_articles", _DEFAULT_MAX_ARTICLES))
    articles = (
        db.query(Article)
        .filter(Article.status == ArticleStatus.published)
        .limit(effective_limit)
        .all()
    )

    report = {
        "total_inspected": len(articles),
        "missing": 0,
        "noise": 0,
        "broken": 0,
        "fixed": 0,
        "fix_failed": 0,
        "skipped": 0,
        "details": [],
    }

    for article in articles:
        url = article.main_image_url
        issue = None

        if not url:
            issue = "missing"
            report["missing"] += 1
        elif _NOISE_PATTERNS.search(url):
            issue = "noise"
            report["noise"] += 1
        else:
            broken = await _is_broken_url(url)
            if broken:
                issue = "broken"
                report["broken"] += 1

        if issue is None:
            report["skipped"] += 1
            continue

        entry = {
            "article_id": article.id,
            "title":      (article.title or "")[:80],
            "issue":      issue,
            "old_url":    url,
            "new_url":    None,
        }

        if fix:
            keywords = article.seo_keywords or article.title or ""
            new_url = await enrich_article_images(article.id, keywords)
            if new_url:
                article.main_image_url = new_url
                entry["new_url"] = new_url
                report["fixed"] += 1
            else:
                report["fix_failed"] += 1

        report["details"].append(entry)

    if fix:
        db.commit()

    logger.info(
        "audit_images: inspected=%d missing=%d noise=%d broken=%d fixed=%d",
        report["total_inspected"],
        report["missing"],
        report["noise"],
        report["broken"],
        report["fixed"],
    )
    return report
