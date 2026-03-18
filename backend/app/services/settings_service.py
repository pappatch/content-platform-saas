"""
Platform settings service — centralised key-value store for tunable runtime parameters.

Settings are persisted in the `platform_settings` table and cached in-process so
hot-path reads (e.g. per-article quality checks inside scraper.py) never hit the
database on every call.

Cache lifecycle
---------------
The cache is populated lazily on the first get() call and invalidated
(fully reloaded from DB) on every set_value() call.  This keeps values
consistent without requiring a server restart.

Thread safety
-------------
The backing dict is protected by a threading.Lock for writes only.  CPython's
GIL guarantees that plain dict reads are atomic, so readers never need to acquire
the lock.  This is safe for FastAPI's single-process asyncio deployment; a
multi-worker setup would require a shared cache (e.g. Redis) instead.

Seeding
-------
seed_defaults() is called once at server startup from main.py before any worker
or request handler runs.  It performs an idempotent INSERT for each default key
that is not yet present in the database.  Existing keys (even with non-default
values) are left unchanged — manual admin changes survive restarts.
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.platform_settings import PlatformSetting, ValueType

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default settings catalogue
# ---------------------------------------------------------------------------

DEFAULTS: list[dict] = [
    {
        "key":         "ai_review_threshold",
        "value":       "0.5",
        "value_type":  ValueType.float,
        "description": (
            "Minimum AI quality score (0–1) for an article to be auto-published. "
            "Articles scoring below this threshold stay pending for human review."
        ),
    },
    {
        "key":         "auto_publish_enabled",
        "value":       "true",
        "value_type":  ValueType.bool,
        "description": (
            "When true, articles that meet the AI score threshold are published "
            "automatically by the review worker. When false, all articles require "
            "manual approval regardless of score."
        ),
    },
    {
        "key":         "trends_auto_site_threshold",
        "value":       "0.55",
        "value_type":  ValueType.float,
        "description": (
            "Minimum trend score (0–1) for a trending keyword to be eligible for "
            "site creation via create_site_from_trend(). Trends scoring below this "
            "threshold are rejected even when created manually."
        ),
    },
    {
        "key":         "trends_auto_site_limit",
        "value":       "3",
        "value_type":  ValueType.int,
        "description": (
            "Maximum number of sites that can be created from Google Trends "
            "(manually or automatically). Prevents uncontrolled site sprawl."
        ),
    },
    {
        "key":         "max_searches_per_job",
        "value":       "10",
        "value_type":  ValueType.int,
        "description": (
            "Maximum number of article URLs fetched and processed per scrape job run. "
            "Higher values produce more articles per run but take longer and consume more API quota."
        ),
    },
    {
        "key":         "min_paragraph_blocks",
        "value":       "3",
        "value_type":  ValueType.int,
        "description": (
            "Minimum number of paragraph blocks required for a scraped page to pass "
            "the content quality gate. Pages with fewer paragraphs are discarded."
        ),
    },
    {
        "key":         "min_word_count",
        "value":       "100",
        "value_type":  ValueType.int,
        "description": (
            "Minimum total word count (across all paragraphs) required to pass the "
            "quality gate. Applied as an OR with min_paragraph_blocks — a short but "
            "real article passes if it meets either threshold."
        ),
    },
    {
        "key":         "trends_fetch_interval_hours",
        "value":       "5",
        "value_type":  ValueType.int,
        "description": (
            "Hours between automatic Google Trends fetches. The new value takes "
            "effect on the next sleep cycle of the trends worker (no restart needed)."
        ),
    },
    {
        "key":         "admin_theme_default",
        "value":       "light",
        "value_type":  ValueType.string,
        "description": (
            "Default admin panel theme for all users on first visit. "
            "Accepted values: light, dark. Individual users can override this "
            "with the toggle in the nav bar; their choice is persisted to localStorage."
        ),
    },
    # -----------------------------------------------------------------------
    # Scraper — search provider limits
    # -----------------------------------------------------------------------
    {
        "key":         "scraper_tavily_max_results",
        "value":       "7",
        "value_type":  ValueType.int,
        "description": (
            "Maximum results requested from Tavily per scrape job search. "
            "Higher values increase article variety but consume more Tavily API quota."
        ),
    },
    {
        "key":         "scraper_google_max_results",
        "value":       "5",
        "value_type":  ValueType.int,
        "description": (
            "Maximum results requested from Google Custom Search per scrape job run. "
            "Google CSE free tier allows 100 queries/day; keep this low to conserve quota."
        ),
    },
    {
        "key":         "blocked_scrape_domains",
        "value":       "pinterest.com,instagram.com,facebook.com,youtube.com,tiktok.com,twitter.com,x.com",
        "value_type":  ValueType.string,
        "description": (
            "Comma-separated domains to skip during scraping — social platforms that "
            "block bots or require API access. Subdomains are also blocked "
            "(e.g. www.instagram.com is blocked when instagram.com is listed)."
        ),
    },
    {
        "key":         "scrape_worker_interval_seconds",
        "value":       "60",
        "value_type":  ValueType.int,
        "description": (
            "How often (in seconds) the scrape worker wakes to check for due jobs. "
            "Lower values give faster job execution but increase CPU usage."
        ),
    },
    # -----------------------------------------------------------------------
    # AI Review — model parameters
    # -----------------------------------------------------------------------
    {
        "key":         "ai_review_input_char_limit",
        "value":       "8000",
        "value_type":  ValueType.int,
        "description": (
            "Maximum characters of article content sent to Claude for rewriting. "
            "Higher values improve output quality but increase Anthropic API cost."
        ),
    },
    {
        "key":         "ai_review_max_tokens",
        "value":       "4096",
        "value_type":  ValueType.int,
        "description": (
            "Maximum output tokens Claude may generate per article review. "
            "Raise for longer rewrites; lower to reduce per-article API cost."
        ),
    },
    # -----------------------------------------------------------------------
    # Images
    # -----------------------------------------------------------------------
    {
        "key":         "default_images_per_site",
        "value":       "5",
        "value_type":  ValueType.int,
        "description": (
            "Number of curated default images fetched from Unsplash for each site. "
            "These are used as fallbacks for articles that have no main image."
        ),
    },
    {
        "key":         "image_max_candidate_pages",
        "value":       "3",
        "value_type":  ValueType.int,
        "description": (
            "Maximum Unsplash API pages tried per search query when looking for a "
            "unique image (10 candidates per page). Higher values reduce duplicates "
            "but increase Unsplash API quota usage."
        ),
    },
    {
        "key":         "image_worker_interval_hours",
        "value":       "6",
        "value_type":  ValueType.int,
        "description": (
            "Hours between image worker passes. Each pass scans all published articles "
            "for missing or broken images and replaces them via Unsplash."
        ),
    },
    {
        "key":         "image_audit_max_articles",
        "value":       "200",
        "value_type":  ValueType.int,
        "description": (
            "Maximum number of articles inspected per manual image audit run "
            "(POST /admin/images/audit). Raise for large sites; lower to keep "
            "audit requests fast."
        ),
    },
    # -----------------------------------------------------------------------
    # Trends
    # -----------------------------------------------------------------------
    {
        "key":         "trends_per_region",
        "value":       "10",
        "value_type":  ValueType.int,
        "description": (
            "Maximum trending topics ingested per region on each Google Trends "
            "fetch. Capped by Google's RSS feed which returns at most 20 items."
        ),
    },
    {
        "key":         "trends_default_scrape_frequency_minutes",
        "value":       "60",
        "value_type":  ValueType.int,
        "description": (
            "Default scrape job frequency (minutes) assigned to sites auto-created "
            "from Google Trends. Can be edited per-job after creation."
        ),
    },
    # -----------------------------------------------------------------------
    # Workers
    # -----------------------------------------------------------------------
    {
        "key":         "review_worker_interval_seconds",
        "value":       "30",
        "value_type":  ValueType.int,
        "description": (
            "How often (in seconds) the review worker polls for pending articles "
            "to send to Claude for AI review. Lower values reduce publish latency."
        ),
    },
]

# Quick key → ValueType lookup (built once from DEFAULTS)
_KEY_TYPES: dict[str, ValueType] = {d["key"]: d["value_type"] for d in DEFAULTS}

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------

_cache: dict[str, str] = {}   # key → raw string value
_cache_loaded: bool = False
_cache_lock = threading.Lock()


def _cast(raw: str, vtype: ValueType) -> Any:
    """
    Cast *raw* string to the Python type declared by *vtype*.

    Raises ValueError / TypeError if the string cannot be converted.
    """
    if vtype == ValueType.float:
        return float(raw)
    if vtype == ValueType.int:
        return int(raw)
    if vtype == ValueType.bool:
        return raw.strip().lower() in ("true", "1", "yes")
    return raw  # string — return as-is


def _load_cache() -> None:
    """
    Populate the in-memory cache from the database.

    Called lazily on the first get() call and after every set_value() call.
    Silently logs on DB error so callers always receive their default value.
    """
    global _cache, _cache_loaded
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        rows = db.query(PlatformSetting).all()
        with _cache_lock:
            _cache = {r.key: r.value for r in rows}
            _cache_loaded = True
    except Exception:
        logger.exception("settings_service: failed to load cache from DB")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get(key: str, default: Any = None) -> Any:
    """
    Return the current value for *key*, cast to its declared Python type.

    The in-memory cache is populated on the first call (lazy load).
    If the key is absent from the cache, *default* is returned unchanged.

    This function is intentionally synchronous so it can be called from
    non-async service code (scraper.py quality gates, trends_worker.py loop).

    Args:
        key:     Setting key, e.g. "ai_review_threshold".
        default: Fallback value when the key is not in the database.

    Returns:
        The typed value (float / int / bool / str) or *default*.
    """
    global _cache_loaded
    if not _cache_loaded:
        _load_cache()
    if key not in _cache:
        return default
    vtype = _KEY_TYPES.get(key, ValueType.string)
    try:
        return _cast(_cache[key], vtype)
    except (ValueError, TypeError):
        logger.warning(
            "settings_service: cannot cast %r=%r as %s — returning default",
            key, _cache[key], vtype,
        )
        return default


def set_value(
    key: str,
    value: str,
    updated_by_id: Optional[int] = None,
) -> "PlatformSetting":
    """
    Persist a new *value* for *key* and invalidate the in-memory cache.

    Validates that *value* can be cast to the key's declared type before
    writing to the database.  Creates the row if it does not yet exist.

    Args:
        key:            Setting key.
        value:          New string-encoded value.
        updated_by_id:  ID of the admin user making the change (nullable).

    Returns:
        The refreshed PlatformSetting ORM row.

    Raises:
        ValueError: If *value* cannot be cast to the key's declared type.
        KeyError:   If *key* is not a known platform setting.
    """
    if key not in _KEY_TYPES:
        raise KeyError(f"Unknown platform setting key: {key!r}")

    vtype = _KEY_TYPES[key]
    try:
        _cast(value, vtype)
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"Invalid value {value!r} for setting {key!r} "
            f"(expected {vtype.value}): {exc}"
        ) from exc

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row is None:
            row = PlatformSetting(
                key=key,
                value_type=vtype,
                description=next(
                    (d["description"] for d in DEFAULTS if d["key"] == key), ""
                ),
            )
            db.add(row)
        row.value = value
        row.updated_by_id = updated_by_id
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
        # Invalidate cache — next get() will reload from DB
        with _cache_lock:
            _cache[key] = value
        logger.info(
            "settings_service: updated %r → %r (by user_id=%s)",
            key, value, updated_by_id,
        )
        return row
    finally:
        db.close()


def get_all() -> list["PlatformSetting"]:
    """
    Return all platform settings rows ordered by key.

    Always reads from the database (bypasses cache) so that the
    updated_by and updated_at fields are always fresh for the admin UI.

    Returns:
        List of PlatformSetting ORM rows.
    """
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        return db.query(PlatformSetting).order_by(PlatformSetting.key).all()
    finally:
        db.close()


def seed_defaults() -> None:
    """
    Idempotently insert default settings that are not yet in the database.

    Called once at server startup (from main.py lifespan) before any worker
    or request handler runs.  Keys that already exist in the DB are left
    untouched — manually configured values survive server restarts.
    """
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        seeded = 0
        for entry in DEFAULTS:
            existing = (
                db.query(PlatformSetting)
                .filter(PlatformSetting.key == entry["key"])
                .first()
            )
            if existing is None:
                db.add(PlatformSetting(
                    key=entry["key"],
                    value=entry["value"],
                    value_type=entry["value_type"],
                    description=entry["description"],
                ))
                seeded += 1
        db.commit()
        if seeded:
            logger.info("settings_service: seeded %d default setting(s)", seeded)
        # Warm the cache immediately so the first worker tick hits it
        _load_cache()
    except Exception:
        logger.exception("settings_service: seed_defaults failed")
        db.rollback()
    finally:
        db.close()
