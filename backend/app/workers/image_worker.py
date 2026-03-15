"""
Image worker — background task that keeps article images healthy.

Behaviour
---------
Startup pass  — immediately on launch (after a short delay so the DB is ready),
                scans ALL published articles whose ``main_image_url`` is null,
                fails validation, or is a generic/mismatched fallback image.

Periodic pass — repeats every IMAGE_WORKER_INTERVAL_HOURS (default 6 h) to
                catch newly-published articles that slipped through with bad images.

Keyword strategy
----------------
Uses each site's scrape-job keywords (ordered most-specific first) as the
Unsplash search query so images match the site topic rather than generic article
text.  Falls back to ``article.seo_keywords`` or title when no job keywords exist.

Generic / mismatched image detection
-------------------------------------
``_is_mismatched_image(url, site_keywords)`` flags two cases:
  1. URL matches the hardcoded ``source.unsplash.com/featured/?`` pattern — these
     are frontend-generated redirect URLs, not curated images.
  2. URL contains animal terms (dog / pet / puppy / canine) but the site's scrape
     keywords contain none of those terms — cross-topic mismatch.

Rate limiting
-------------
1 article per second (RATE_LIMIT_DELAY) between Unsplash API calls.
Unsplash free tier: 50 req/hr.  At 1 RPS we can fix up to 50 articles per run,
which is generous for typical batch sizes.

Design invariants
-----------------
- The worker never raises — all errors are caught, logged, and suppressed.
- Each article's DB change is committed individually so a crash mid-run does not
  roll back already-fixed articles.
- The worker reads site config and scrape jobs inside the DB session so data is
  always fresh.
"""

import asyncio
import logging
import re

from app.database import SessionLocal
from app.models.article import Article, ArticleStatus
from app.models.scrape_job import ScrapeJob
from app.models.site import Site
from app.services import settings_service
from app.services.image_validator import is_valid_image_url, validate_and_fix_article_image

logger = logging.getLogger(__name__)

_DEFAULT_INTERVAL_HOURS: int = 6   # fallback if platform_settings DB is unavailable
RATE_LIMIT_DELAY: float = 1.0       # seconds between Unsplash API calls (infrastructure constant)
STARTUP_DELAY_SECONDS: float = 10.0 # wait before the first pass (infrastructure constant)

# Matches the frontend hardcoded-fallback redirect pattern — these should be
# replaced with curated images rather than kept as-is.
_HARDCODED_FALLBACK_RE = re.compile(
    r"source\.unsplash\.com/featured/\?", re.IGNORECASE
)

# Animal terms that signal a cross-topic mismatch when present in a URL for a
# site whose scrape keywords have nothing to do with pets.
_ANIMAL_TERM_RE = re.compile(r"\b(dog|pet|puppy|puppies|canine)\b", re.IGNORECASE)
_ANIMAL_KEYWORDS = {"dog", "pet", "puppy", "puppies", "canine", "shih", "shih tzu"}


def _is_mismatched_image(url: str, site_scrape_keywords: list[str]) -> bool:
    """
    Return True if *url* is a generic or cross-topic image for this site.

    Flags:
    - URLs matching the ``source.unsplash.com/featured/?`` redirect pattern
      (these are lazy frontend-only fallbacks, not specifically searched).
    - URLs containing dog/pet terms for sites whose scrape keywords have no
      pet-related content.
    """
    if not url:
        return False

    if _HARDCODED_FALLBACK_RE.search(url):
        return True

    if _ANIMAL_TERM_RE.search(url):
        site_kw_text = " ".join(site_scrape_keywords).lower()
        if not any(term in site_kw_text for term in _ANIMAL_KEYWORDS):
            return True

    return False


async def _fix_article_images() -> dict:
    """
    Scan all published articles and fix invalid, missing, or mismatched images.

    Returns a report dict with keys: total, fixed, skipped, failed.
    """
    db = SessionLocal()
    report = {"total": 0, "fixed": 0, "skipped": 0, "failed": 0}

    try:
        # Load all published articles, nulls first
        articles: list[Article] = (
            db.query(Article)
            .filter(Article.status == ArticleStatus.published)
            .order_by(Article.main_image_url.is_(None).desc(), Article.id.asc())
            .all()
        )
        report["total"] = len(articles)
        logger.info("Image worker: scanning %d published articles", len(articles))

        # Cache site rows (config.default_images) to avoid N+1 queries
        site_map: dict[int, Site] = {s.id: s for s in db.query(Site).all()}

        # Build scrape-keyword map per site — ordered most-specific first
        scrape_kw_map: dict[int, list[str]] = {}
        for job in db.query(ScrapeJob).all():
            lst = scrape_kw_map.setdefault(job.site_id, [])
            seen = set(lst)
            for kw in (job.keywords or []):
                kw_norm = kw.lower().strip()
                if kw_norm and kw_norm not in seen:
                    seen.add(kw_norm)
                    lst.append(kw_norm)

        for article in articles:
            try:
                site_scrape_kws = scrape_kw_map.get(article.site_id) or []

                # Cheap path: valid image that isn't a mismatched generic fallback
                if article.main_image_url:
                    if await is_valid_image_url(article.main_image_url):
                        if not _is_mismatched_image(article.main_image_url, site_scrape_kws):
                            report["skipped"] += 1
                            continue
                        logger.info(
                            "Image worker: article %d has mismatched/generic image, replacing",
                            article.id,
                        )

                # Determine site defaults for last-resort fallback
                site = site_map.get(article.site_id)
                site_defaults: list[str] | None = None
                if site and isinstance(site.config, dict):
                    imgs = site.config.get("default_images")
                    if isinstance(imgs, list) and imgs:
                        site_defaults = imgs

                # Prefer site scrape keywords; fall back to article-level text
                keywords: str | list[str] = (
                    site_scrape_kws
                    or article.seo_keywords
                    or article.title
                    or ""
                )

                new_url = await validate_and_fix_article_image(
                    article.id,
                    article.main_image_url,
                    keywords,
                    site_defaults,
                )

                if new_url and new_url != article.main_image_url:
                    article.main_image_url = new_url
                    db.commit()
                    report["fixed"] += 1
                    logger.info(
                        "Image worker: fixed article %d → %s…",
                        article.id,
                        new_url[:60],
                    )
                else:
                    report["failed"] += 1
                    logger.warning(
                        "Image worker: could not fix article %d (url=%s)",
                        article.id,
                        (article.main_image_url or "null")[:60],
                    )

            except Exception:
                report["failed"] += 1
                logger.exception(
                    "Image worker: unexpected error while fixing article %d", article.id
                )

            # Rate-limit: 1 article / second
            await asyncio.sleep(RATE_LIMIT_DELAY)

    except Exception:
        logger.exception("Image worker: unexpected error during scan")
    finally:
        db.close()

    logger.info(
        "Image worker: run complete — total=%d fixed=%d skipped=%d failed=%d",
        report["total"],
        report["fixed"],
        report["skipped"],
        report["failed"],
    )
    return report


async def image_worker_loop() -> None:
    """
    Infinite async loop.  Started as an ``asyncio.Task`` at app startup and
    cancelled cleanly on shutdown.

    Sequence:
    1. Wait ``STARTUP_DELAY_SECONDS`` so the DB connection pool is ready.
    2. Run an immediate startup pass.
    3. Sleep ``IMAGE_WORKER_INTERVAL_HOURS`` and repeat.
    """
    logger.info(
        "Image worker started (startup delay=%ds, interval from platform_settings)",
        int(STARTUP_DELAY_SECONDS),
    )
    await asyncio.sleep(STARTUP_DELAY_SECONDS)

    while True:
        interval_hours = settings_service.get("image_worker_interval_hours", _DEFAULT_INTERVAL_HOURS)
        try:
            await _fix_article_images()
        except Exception:
            logger.exception("Image worker: unhandled error in _fix_article_images")
        logger.debug("Image worker: sleeping %dh", interval_hours)
        await asyncio.sleep(int(interval_hours) * 3600)
