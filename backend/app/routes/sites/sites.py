"""
Site management routes.

GET              /sites                   — list sites (any authenticated user)
GET              /sites/stats             — per-site article counts, pin counts, job status (admin)
GET              /sites/{id}              — get one site (any authenticated user)
POST             /sites                   — create a site (admin only); AI-enriches config if about/tagline missing
POST             /sites/ai-preview        — AI-generated config preview for a site name (admin only)
POST             /sites/{id}/ai-enrich    — fill missing tagline/about/categories via Claude (admin only)
GET              /sites/{id}/default-images — fetch + persist 5 Unsplash images for site's keywords (admin only)
PATCH            /sites/{id}              — update a site (admin only)
DELETE           /sites/{id}              — soft-delete: set is_active=False (admin only)
"""

import logging
import re
import urllib.parse
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.category import Category
from app.models.scrape_job import ScrapeJob
from app.models.site import Site
from app.models.user import User
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse
from app.security.permissions import get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sites", tags=["Sites"])


# ---------------------------------------------------------------------------
# Stats (must come before /{site_id} to avoid path-param conflict)
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_sites_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Return per-site aggregated stats: article counts, active pin count,
    and latest scrape-job info.
    """
    sites = db.query(Site).order_by(Site.created_at.desc()).all()
    site_ids = [s.id for s in sites]
    if not site_ids:
        return []

    # --- Article counts per site+status ---
    article_rows = (
        db.query(Article.site_id, Article.status, func.count(Article.id))
        .filter(Article.site_id.in_(site_ids))
        .group_by(Article.site_id, Article.status)
        .all()
    )
    counts: dict[int, dict[str, int]] = {}
    for site_id, art_status, cnt in article_rows:
        counts.setdefault(site_id, {})[art_status.value] = cnt

    # --- Active pin count per site ---
    # Use naive UTC to match SQLite's timezone-stripped datetime storage.
    now_utc = datetime.utcnow()
    pin_rows = (
        db.query(Article.site_id, func.count(Article.id))
        .filter(
            Article.site_id.in_(site_ids),
            Article.status == ArticleStatus.published,
            or_(Article.is_pinned == True, Article.pinned_until > now_utc),
        )
        .group_by(Article.site_id)
        .all()
    )
    pin_map: dict[int, int] = {row[0]: row[1] for row in pin_rows}

    # --- Latest scrape job per site ---
    job_map: dict[int, ScrapeJob] = {}
    for site_id in site_ids:
        job = (
            db.query(ScrapeJob)
            .filter(ScrapeJob.site_id == site_id)
            .order_by(ScrapeJob.last_run.desc().nullslast(), ScrapeJob.created_at.desc())
            .first()
        )
        if job:
            job_map[site_id] = job

    # --- Assemble result ---
    result = []
    for site in sites:
        site_counts = counts.get(site.id, {})
        job = job_map.get(site.id)
        next_run = None
        if job and job.last_run and job.frequency_minutes:
            next_run = (job.last_run + timedelta(minutes=job.frequency_minutes)).isoformat()
        result.append({
            "site_id":           site.id,
            "published":         site_counts.get("published", 0),
            "pending":           site_counts.get("pending", 0),
            "removed":           site_counts.get("removed", 0),
            "active_pin_count":  pin_map.get(site.id, 0),
            "job_id":            job.id if job else None,
            "job_status":        job.status.value if job else None,
            "last_run":          job.last_run.isoformat() if job and job.last_run else None,
            "last_error":        job.error_message if job else None,
            "frequency_minutes": job.frequency_minutes if job else None,
            "next_run":          next_run,
        })
    return result


# ---------------------------------------------------------------------------
# AI preview (must also come before /{site_id})
# ---------------------------------------------------------------------------

class SiteAIPreviewRequest(BaseModel):
    name: str
    language: str = "en"
    keywords: List[str] = []


@router.post("/ai-preview")
async def preview_site_config(
    body: SiteAIPreviewRequest,
    current_user: User = Depends(require_admin),
):
    """
    Call Claude Haiku to generate a site config preview (name, tagline, about,
    default_category_names, colors) from a site name + optional keyword hints.
    Does not save anything — used by the "Generate with AI" button in SiteModal.
    """
    from app.services.trends_service import generate_site_config
    try:
        keyword = body.name
        if body.keywords:
            keyword = f"{body.name}: {', '.join(body.keywords[:5])}"
        preview = await generate_site_config(keyword, body.language)
        return preview
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("sites/ai-preview: %s", exc)
        raise HTTPException(status_code=500, detail="AI config generation failed")


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

@router.get("", response_model=List[SiteResponse])
def list_sites(
    show_all: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Site)
    if not show_all:
        query = query.filter(Site.is_active == True)
    return query.order_by(Site.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Get one
# ---------------------------------------------------------------------------

@router.get("/{site_id}", response_model=SiteResponse)
def get_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
async def create_site(
    site_data: SiteCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Create a new site.

    AI enrichment (best-effort): if config.about or config.tagline is missing,
    calls Claude Haiku to generate them along with default_category_names.
    Errors from the AI call are caught and logged — site creation never fails
    due to AI unavailability.

    After saving, creates Category rows for each name in
    config.default_category_names (up to 5) if none already exist for this site.

    Default images: if ``config.default_images`` is absent, schedules a
    background task to fetch 5 curated Unsplash images after the response is
    returned — so the client is never blocked by the Unsplash API call.
    """
    existing = db.query(Site).filter(Site.domain == site_data.domain).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain already registered")

    config = dict(site_data.config or {})

    # --- AI enrichment when about or tagline is missing ---
    if not config.get("about") or not config.get("tagline"):
        try:
            from app.services.trends_service import generate_site_config
            keyword = site_data.name
            ai = await generate_site_config(keyword, site_data.language.value)
            if not config.get("about"):
                config["about"] = ai.config.get("about", "")
            if not config.get("tagline"):
                config["tagline"] = ai.config.get("tagline", "")
            if not config.get("default_category_names"):
                config["default_category_names"] = ai.config.get("default_category_names", [])
            logger.info("create_site: AI enrichment applied for site '%s'", site_data.name)
        except Exception as exc:
            logger.warning("create_site: AI enrichment failed (%s) — creating site without it", exc)

    site = Site(
        name=site_data.name,
        domain=site_data.domain,
        template_id=site_data.template_id,
        language=site_data.language,
        config=config,
    )
    db.add(site)
    db.commit()
    db.refresh(site)

    # --- Create initial categories from default_category_names ---
    default_cats = config.get("default_category_names", [])
    for cat_name in default_cats[:5]:
        if not cat_name or not cat_name.strip():
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", cat_name.lower()).strip("-")
        if not slug:
            continue
        exists = db.query(Category).filter(
            Category.site_id == site.id,
            Category.slug == slug,
        ).first()
        if not exists:
            db.add(Category(name=cat_name.strip(), slug=slug, site_id=site.id))
    db.commit()
    db.refresh(site)

    # --- Generate logo (Stability AI with SVG fallback) ---
    try:
        from app.services.logo_service import generate_logo
        scrape_kws: list[str] = []
        for job in db.query(ScrapeJob).filter(ScrapeJob.site_id == site.id).all():
            for kw in (job.keywords or []):
                kw_norm = kw.lower().strip()
                if kw_norm and kw_norm not in scrape_kws:
                    scrape_kws.append(kw_norm)
        logo_url = await generate_logo(
            site.name,
            config.get("primary_color"),
            config.get("secondary_color"),
            scrape_kws,
        )
        config["logo_url"] = logo_url
        site.config = config
        db.commit()
        db.refresh(site)
    except Exception:
        logger.warning("create_site: logo generation failed for site %d", site.id, exc_info=True)

    # --- Auto-fetch default images in the background if not already set ---
    if not config.get("default_images"):
        async def _fetch_defaults(sid: int) -> None:
            try:
                from app.services.image_service import enrich_article_images
                from app.services.image_validator import is_valid_image_url
                from app.database import SessionLocal as _SL

                _db = _SL()
                try:
                    _site = _db.query(Site).filter(Site.id == sid).first()
                    if not _site:
                        return
                    _cfg = dict(_site.config or {})
                    _kws: list[str] = []
                    if _site.name:
                        _kws.append(_site.name)
                    for cn in (_cfg.get("default_category_names") or []):
                        _kws.append(cn)
                    if not _kws:
                        _kws = ["news", "world", "people", "nature", "city"]
                    _images: list[str] = []
                    for i in range(5):
                        kw = _kws[i % len(_kws)]
                        url = await enrich_article_images(-(sid * 10 + i), f"{kw} professional photography")
                        if url and await is_valid_image_url(url):
                            _images.append(url)
                        else:
                            _images.append(f"https://source.unsplash.com/featured/?{urllib.parse.quote(kw)}")
                    _cfg["default_images"] = _images
                    _site.config = _cfg
                    _db.commit()
                    logger.info("create_site: default images fetched for site %d", sid)
                finally:
                    _db.close()
            except Exception:
                logger.warning("create_site: background default-image fetch failed for site %d", sid, exc_info=True)

        import asyncio
        asyncio.create_task(_fetch_defaults(site.id))

    return site


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# AI-enrich existing site (fills missing tagline / about / default_category_names)
# ---------------------------------------------------------------------------

@router.post("/{site_id}/ai-enrich", response_model=SiteResponse)
async def ai_enrich_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Call Claude Haiku to generate missing config fields (tagline, about,
    default_category_names) for an existing site, then persist the result.

    Only fills fields that are currently empty — existing values are preserved.
    Also auto-creates Category rows from default_category_names if none exist.
    Raises 502 if the Anthropic API call fails.
    """
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    config = dict(site.config or {})
    try:
        from app.services.trends_service import generate_site_config
        ai = await generate_site_config(site.name, site.language.value)
        if not config.get("tagline"):
            config["tagline"] = ai.config.get("tagline", "")
        if not config.get("about"):
            config["about"] = ai.config.get("about", "")
        if not config.get("default_category_names"):
            config["default_category_names"] = ai.config.get("default_category_names", [])
    except Exception as exc:
        logger.error("ai_enrich_site: AI call failed for site %d — %s", site_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI enrichment failed — check ANTHROPIC_API_KEY",
        )

    site.config = config
    db.commit()

    # Auto-create categories from default_category_names if not already present
    default_cats = config.get("default_category_names", [])
    for cat_name in default_cats[:5]:
        if not cat_name or not cat_name.strip():
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", cat_name.lower()).strip("-")
        if not slug:
            continue
        exists = db.query(Category).filter(
            Category.site_id == site.id,
            Category.slug == slug,
        ).first()
        if not exists:
            db.add(Category(name=cat_name.strip(), slug=slug, site_id=site.id))
    db.commit()
    db.refresh(site)

    logger.info("ai_enrich_site: enriched site %d '%s'", site.id, site.name)
    return site


# ---------------------------------------------------------------------------
# Default images — curated Unsplash images for a site's keyword set
# ---------------------------------------------------------------------------

@router.get("/{site_id}/default-images")
async def get_site_default_images(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Fetch 5 curated Unsplash images for the site's keyword set and store them
    in site.config.default_images.  Returns the list of image URLs.

    If UNSPLASH_ACCESS_KEY is not configured, returns placeholder URLs.
    """
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    # Build keyword list: site name → default_category_names → tagline words
    config = dict(site.config or {})
    seen: set[str] = set()
    keywords: list[str] = []

    def push_kw(k: str) -> None:
        norm = k.lower().strip()
        if norm and norm not in seen:
            seen.add(norm)
            keywords.append(norm)

    push_kw(site.name)
    for cn in config.get("default_category_names") or []:
        push_kw(cn)
    if config.get("tagline"):
        for word in config["tagline"].split():
            if len(word) > 4:
                push_kw(word)

    if not keywords:
        keywords = ["news", "world", "people", "nature", "city"]

    # Fetch 5 validated images (one per keyword + "professional photography" suffix).
    # Negative synthetic IDs used for logging only — won't collide with real article IDs.
    from app.services.image_service import enrich_article_images
    from app.services.image_validator import is_valid_image_url
    images: list[str] = []
    for i in range(5):
        kw = keywords[i % len(keywords)]
        enriched_kw = f"{kw} professional photography"
        url = await enrich_article_images(-(site_id * 10 + i), enriched_kw)
        if url and await is_valid_image_url(url):
            images.append(url)
        else:
            # Fallback: try without the suffix, then plain redirect
            url2 = await enrich_article_images(-(site_id * 10 + i + 50), kw)
            if url2 and await is_valid_image_url(url2):
                images.append(url2)
            else:
                images.append(f"https://source.unsplash.com/featured/?{urllib.parse.quote(kw)}")

    # Persist to site.config.default_images
    config["default_images"] = images
    site.config = config
    db.commit()
    db.refresh(site)

    logger.info("get_site_default_images: generated %d validated images for site %d", len(images), site_id)
    return {"site_id": site_id, "images": images}


# ---------------------------------------------------------------------------
# Regenerate logo
# ---------------------------------------------------------------------------

@router.post("/{site_id}/regenerate-logo", response_model=SiteResponse)
async def regenerate_site_logo(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    (Re-)generate the logo for a site via Stability AI (SVG fallback if key absent).
    Persists result to site.config.logo_url.
    """
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    from app.services.logo_service import generate_logo

    config = dict(site.config or {})
    scrape_kws: list[str] = []
    seen: set[str] = set()
    for job in db.query(ScrapeJob).filter(ScrapeJob.site_id == site_id).all():
        for kw in (job.keywords or []):
            kw_norm = kw.lower().strip()
            if kw_norm and kw_norm not in seen:
                seen.add(kw_norm)
                scrape_kws.append(kw_norm)

    logo_url = await generate_logo(
        site.name,
        config.get("primary_color"),
        config.get("secondary_color"),
        scrape_kws,
    )
    config["logo_url"] = logo_url
    site.config = config
    db.commit()
    db.refresh(site)

    logger.info("regenerate_site_logo: regenerated logo for site %d '%s'", site.id, site.name)
    return site


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

@router.patch("/{site_id}", response_model=SiteResponse)
def update_site(
    site_id: int,
    site_data: SiteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    updates = site_data.model_dump(exclude_unset=True)
    if "domain" in updates:
        conflict = db.query(Site).filter(Site.domain == updates["domain"], Site.id != site_id).first()
        if conflict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain already registered")
    for field, value in updates.items():
        setattr(site, field, value)
    db.commit()
    db.refresh(site)
    return site


# ---------------------------------------------------------------------------
# Deactivate (soft-delete)
# ---------------------------------------------------------------------------

@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    site.is_active = False
    db.commit()
