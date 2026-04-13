"""
Google Trends routes.

GET  /trends                        — list trends (admin only), with filters
GET  /trends/stats                  — summary counts + auto-site limit status
GET  /trends/regions                — grouped region catalogue
GET  /trends/settings               — active fetch-region setting
POST /trends/settings               — update fetch-region setting
POST /trends/fetch                  — manually trigger a trend fetch (admin only)
GET  /trends/explore                — pytrends interest/countries/queries for a keyword
GET  /trends/explore/site-config    — AI site config preview for a raw keyword
POST /trends/explore/create-site    — create Site + ScrapeJob from a raw keyword
GET  /trends/{id}/site-config       — AI site config preview for a stored trend
POST /trends/{id}/dismiss           — dismiss a trend (admin only)
POST /trends/{id}/create-site       — create Site + ScrapeJob from a trend (admin only)

All routes require the admin role.  Trends data is considered internal
operational data, not exposed to editors or viewers.

Security notes
--------------
- Rate limiting on POST /trends/fetch and GET /trends/explore should be added
  at the nginx/slowapi layer before production (R1 from REVIEW.md).
- All keyword input is sanitised in trends_service before DB insertion or API use.
- fetch_region is validated to be "" or a 2-letter ISO code.
"""

import logging
import re
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
from app.models.site import Site, SiteLanguage
from app.models.trend import Trend, TrendStatus
from app.models.user import User
from app.schemas.trend import (
    CreateSiteFromTrend,
    CreateSiteResult,
    ExploreSiteResult,
    ExploreResult,
    RegionGroup,
    SiteConfigPreview,
    TrendResponse,
    TrendSettings,
    TrendSettingsUpdate,
)
from app.security.permissions import require_admin
from app.services import settings_service
from app.services.trends_service import (
    REGIONS_GROUPED,
    TIMEFRAME_MAP,
    _GEO_LANGUAGE_MAP,
    create_site_from_trend,
    explore_keyword,
    fetch_and_store_trends,
    generate_site_config,
    get_fetch_region,
    set_fetch_region,
)

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/trends", tags=["Trends"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _enrich_with_duplicate_flag(trends: list[Trend], db: Session) -> list[TrendResponse]:
    """
    Add is_duplicate=True to any trend whose keyword has been seen (used or
    dismissed) on a *different* date.  This lets the UI show a "Seen before"
    badge without a separate API call.
    """
    # Build a set of keywords that have a historical record
    historical_keywords: set[str] = {
        row.keyword
        for row in db.query(Trend.keyword)
        .filter(Trend.status.in_([TrendStatus.used, TrendStatus.dismissed]))
        .distinct()
        .all()
    }

    result: list[TrendResponse] = []
    for t in trends:
        resp = TrendResponse.model_validate(t)
        resp.is_duplicate = t.keyword in historical_keywords
        result.append(resp)
    return result


# ---------------------------------------------------------------------------
# GET /trends
# ---------------------------------------------------------------------------

@router.get("", response_model=List[TrendResponse])
def list_trends(
    trend_status: Optional[TrendStatus] = Query(None, alias="status"),
    language: Optional[str] = Query(None),
    trend_date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    List trending keywords, newest first.

    Filters:
    - status: new | used | dismissed
    - language: en / he / ar / fr
    - trend_date: YYYY-MM-DD
    - limit / offset: pagination
    """
    query = db.query(Trend)

    if trend_status is not None:
        query = query.filter(Trend.status == trend_status)
    if language:
        query = query.filter(Trend.language == language)
    if trend_date:
        query = query.filter(Trend.trend_date == trend_date)

    trends = (
        query.order_by(Trend.trend_date.desc(), Trend.score.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return _enrich_with_duplicate_flag(trends, db)


# ---------------------------------------------------------------------------
# GET /trends/stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_trends_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Return a summary of trend counts by status and the auto-site quota.

    Response shape:
    {
      "new": 12, "used": 2, "dismissed": 5,
      "auto_site_limit": 3, "auto_sites_created": 2
    }
    """
    from sqlalchemy import func
    rows = (
        db.query(Trend.status, func.count(Trend.id))
        .group_by(Trend.status)
        .all()
    )
    counts = {s.value: 0 for s in TrendStatus}
    for row_status, cnt in rows:
        counts[row_status.value] = cnt

    auto_created = counts.get("used", 0)
    return {
        **counts,
        "auto_site_limit": settings_service.get("trends_auto_site_limit", 3),
        "auto_sites_created": auto_created,
    }


# ---------------------------------------------------------------------------
# POST /trends/fetch
# ---------------------------------------------------------------------------

@router.post("/fetch", status_code=status.HTTP_202_ACCEPTED)
def trigger_fetch(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
):
    """
    Manually trigger a Google Trends fetch.

    The fetch runs as a background task and returns immediately.
    Poll GET /trends to see new results.
    """
    background_tasks.add_task(_run_fetch_background)
    return {"detail": "Trends fetch started in background"}


def _run_fetch_background() -> None:
    """Sync wrapper so BackgroundTasks can call the async fetch."""
    import asyncio
    try:
        asyncio.run(fetch_and_store_trends())
    except Exception:
        logger.exception("trends: background fetch failed")


# ---------------------------------------------------------------------------
# GET /trends/regions
# ---------------------------------------------------------------------------

@router.get("/regions", response_model=List[RegionGroup])
def list_regions(_: User = Depends(require_admin)):
    """
    Return the full grouped region catalogue.

    Response is static — updating the list requires a server-side code change
    (add an entry to REGIONS_GROUPED in trends_service.py).

    Used by the frontend to build the region selector dropdown.
    """
    return REGIONS_GROUPED


# ---------------------------------------------------------------------------
# GET /trends/settings  +  POST /trends/settings
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=TrendSettings)
def get_settings_route(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Return the current active fetch-region setting.

    fetch_region: "" = worldwide, "US" = United States, etc.
    Both the background worker and "Run Now" use this setting.
    """
    return TrendSettings(fetch_region=get_fetch_region(db))


@router.post("/settings", response_model=TrendSettings)
def update_settings(
    body: TrendSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Persist the active fetch-region setting.

    The new value takes effect on the next scheduled worker run and on
    the next "Run Now" call.

    Accepts:
      fetch_region: "" (worldwide) or a 2-letter uppercase ISO country code.
    """
    saved = set_fetch_region(db, body.fetch_region)
    return TrendSettings(fetch_region=saved)


# ---------------------------------------------------------------------------
# GET /trends/explore
# ---------------------------------------------------------------------------

@router.get("/explore", response_model=ExploreResult)
async def explore_keyword_route(
    keyword: str = Query(..., min_length=1, max_length=200, description="Search keyword to explore"),
    timeframe: str = Query("30d", description="30d | 90d | 1y"),
    geo: str = Query("", description="ISO country code or '' for worldwide"),
    _: User = Depends(require_admin),
):
    """
    Run a keyword exploration via pytrends and return interest data.

    Returns:
    - interest_over_time : daily relative interest (0–100) for the timeframe
    - top_countries      : up to 20 countries ranked by interest
    - related_queries    : up to 10 related search terms

    This endpoint is for manual research only — it does not write to the DB.

    Security: keyword is sanitised; timeframe and geo are validated by pattern.
    """
    # Validate timeframe
    if timeframe not in TIMEFRAME_MAP:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"timeframe must be one of: {', '.join(TIMEFRAME_MAP)}",
        )
    # Validate geo: empty string or 2 uppercase letters
    if geo and not re.match(r"^[A-Z]{2}$", geo):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="geo must be '' (worldwide) or a 2-letter uppercase ISO code",
        )

    from app.services.trends_service import _sanitize_keyword
    clean_kw = _sanitize_keyword(keyword)
    if not clean_kw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="keyword contains no valid characters after sanitisation",
        )

    try:
        data = await explore_keyword(clean_kw, timeframe, geo)
    except ValueError as exc:
        # Service raises ValueError with a user-friendly message after exhausting retries
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except Exception as exc:
        logger.exception("explore_keyword_route: unexpected error for %r", clean_kw)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="pytrends exploration failed — please try again shortly.",
        )

    return ExploreResult(
        keyword=clean_kw,
        timeframe=timeframe,
        geo=geo,
        interest_over_time=data["interest_over_time"],
        top_countries=data["top_countries"],
        related_queries=data["related_queries"],
    )


# ---------------------------------------------------------------------------
# GET /trends/explore/site-config
# ---------------------------------------------------------------------------

@router.get("/explore/site-config", response_model=SiteConfigPreview)
async def get_explore_site_config(
    keyword: str = Query(..., min_length=1, max_length=200),
    language: str = Query("en"),
    _: User = Depends(require_admin),
):
    """
    Ask Claude Haiku to generate a site configuration preview for a raw keyword.

    Used by the Explore tab's Create Site modal.
    Idempotent — does not write to the DB.
    """
    if language not in ("en", "fr", "he", "ar"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="language must be one of: en, fr, he, ar",
        )
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY not configured",
        )

    from app.services.trends_service import _sanitize_keyword
    clean_kw = _sanitize_keyword(keyword)
    if not clean_kw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid keyword",
        )

    try:
        config = await generate_site_config(clean_kw, language)
    except Exception as exc:
        logger.error("get_explore_site_config: failed for %r — %s", clean_kw, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI config generation failed — please try again",
        )
    return config


# ---------------------------------------------------------------------------
# POST /trends/explore/create-site
# ---------------------------------------------------------------------------

@router.post(
    "/explore/create-site",
    response_model=ExploreSiteResult,
    status_code=status.HTTP_201_CREATED,
)
async def create_site_from_explore(
    keyword: str = Query(..., min_length=1, max_length=200),
    language: str = Query("en"),
    body: CreateSiteFromTrend = CreateSiteFromTrend(),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Create a Site + ScrapeJob directly from a raw keyword (Explore tab flow).

    Internally creates a temporary Trend row so the audit trail is consistent
    with the main trend-based create flow.  Enforces TRENDS_AUTO_SITE_LIMIT.

    Args (query params):
      keyword:  The keyword to create a site around.
      language: Target site language (en / fr / he / ar).

    Returns ExploreSiteResult (site + scrape_job — no trend in the response).
    """
    if language not in ("en", "fr", "he", "ar"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="language must be one of: en, fr, he, ar",
        )

    from app.services.trends_service import _sanitize_keyword, _count_auto_created_sites
    clean_kw = _sanitize_keyword(keyword)
    if not clean_kw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid keyword",
        )

    # Enforce the auto-site limit before doing any async work
    auto_limit = settings_service.get("trends_auto_site_limit", 3)
    if _count_auto_created_sites(db) >= auto_limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Auto-site limit reached ({auto_limit}). "
                "Raise trends_auto_site_limit in Platform Settings or dismiss existing auto-sites."
            ),
        )

    # Create a synthetic Trend row so create_site_from_trend can be reused
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    synthetic_trend = Trend(
        keyword=clean_kw,
        region="",
        language=language,
        score=None,
        trend_date=today,
        status=TrendStatus.new,
    )
    db.add(synthetic_trend)
    db.flush()  # get the ID
    trend_id = synthetic_trend.id
    db.commit()

    overrides = body.model_dump(exclude_none=True)
    try:
        result = await create_site_from_trend(trend_id, overrides=overrides)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        logger.exception("create_site_from_explore: unexpected error for keyword %r", clean_kw)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Site creation failed — see server logs",
        )

    return ExploreSiteResult(site=result["site"], scrape_job=result["scrape_job"])


# ---------------------------------------------------------------------------
# GET /trends/{id}/site-config
# ---------------------------------------------------------------------------

@router.get("/{trend_id}/site-config", response_model=SiteConfigPreview)
async def get_site_config_preview(
    trend_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Ask Claude Haiku to generate a site configuration preview for this trend.

    Idempotent — does not modify any DB row.  Call this to populate the
    Create Site modal before the admin confirms.
    """
    trend = db.query(Trend).filter(Trend.id == trend_id).first()
    if not trend:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trend not found")

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY not configured",
        )

    try:
        config = await generate_site_config(trend.keyword, trend.language)
    except Exception as exc:
        logger.error("get_site_config_preview: failed for trend %d — %s", trend_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI config generation failed — please try again",
        )

    return config


# ---------------------------------------------------------------------------
# POST /trends/{id}/dismiss
# ---------------------------------------------------------------------------

@router.post("/{trend_id}/dismiss", response_model=TrendResponse)
def dismiss_trend(
    trend_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Dismiss a trend so it no longer appears in the active queue.

    Idempotent — dismissing an already-dismissed trend is a no-op.
    Cannot dismiss a trend that was already used to create a site.
    """
    trend = db.query(Trend).filter(Trend.id == trend_id).first()
    if not trend:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trend not found")

    if trend.status == TrendStatus.used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot dismiss a trend that was already used to create a site",
        )

    if trend.status != TrendStatus.dismissed:
        trend.status = TrendStatus.dismissed
        db.commit()
        db.refresh(trend)

    resp = TrendResponse.model_validate(trend)
    resp.is_duplicate = False
    return resp


# ---------------------------------------------------------------------------
# POST /trends/{id}/create-site
# ---------------------------------------------------------------------------

@router.post(
    "/{trend_id}/create-site",
    response_model=CreateSiteResult,
    status_code=status.HTTP_201_CREATED,
)
async def create_site(
    trend_id: int,
    body: CreateSiteFromTrend = CreateSiteFromTrend(),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Create a new Site and ScrapeJob from a trending keyword.

    - Calls Claude Haiku to generate site name, brand colours, template, and
      search keywords (unless overridden in the request body).
    - Marks the Trend as status=used and links it to the new Site.
    - Enforces the TRENDS_AUTO_SITE_LIMIT (default 3) server-side.

    Returns the created Trend, Site, and ScrapeJob.
    """
    # Verify trend exists and is eligible (service layer will also check,
    # but we return a clear 404/409 here rather than a 500)
    trend = db.query(Trend).filter(Trend.id == trend_id).first()
    if not trend:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trend not found")
    if trend.status == TrendStatus.used:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This trend was already used to create a site",
        )
    if trend.status == TrendStatus.dismissed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot create a site from a dismissed trend",
        )

    overrides = body.model_dump(exclude_none=True)

    try:
        result = await create_site_from_trend(trend_id, overrides=overrides)
    except ValueError as exc:
        # Site limit reached or other business-logic error
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        logger.exception("create_site: unexpected error for trend %d", trend_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Site creation failed — see server logs",
        )

    return CreateSiteResult(
        trend=TrendResponse.model_validate(result["trend"]),
        site=result["site"],
        scrape_job=result["scrape_job"],
    )
