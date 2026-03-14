"""
Image validation service.

Determines whether a URL points to a usable, high-quality image:

  VALID   — HTTP 200 (after redirects), Content-Type starts with "image/",
             Content-Length (when present) > MIN_SIZE_BYTES, URL contains no
             known-noise patterns.

  INVALID — 4xx/5xx response, non-image content-type, Content-Length ≤ 5 KB
             (likely a tracking pixel), or URL matches _NOISE_RE.

For invalid/missing images: fetch a replacement from Unsplash using article
SEO keywords, with a retry on title words and a final fallback to the site's
pre-curated ``config.default_images``.

Trusted domains
---------------
Unsplash CDN URLs (``images.unsplash.com``, ``source.unsplash.com``) skip the
network check — we generated them ourselves so they are always valid.

Security invariants
-------------------
- HEAD requests use a short timeout (default 5 s) and follow_redirects=True.
- No user-supplied URLs are used as proxy targets — the validator only checks
  URLs already stored in the database by the backend scraper.
- All exceptions are caught and logged; never propagated to callers.
"""

import logging
import re

import httpx

logger = logging.getLogger(__name__)

# Images smaller than this are almost certainly tracking pixels
MIN_SIZE_BYTES: int = 5 * 1024  # 5 KB

# Domains we trust unconditionally (Unsplash CDN)
_TRUSTED_DOMAINS = {"images.unsplash.com", "source.unsplash.com"}

# URL patterns that indicate tracking pixels, icons, SVGs, or other non-article images.
# SVGs are excluded because they're almost always logos/graphics, not photographic content.
_NOISE_RE = re.compile(
    r"(1x1|/pixel[._\-/]|[._\-/]pixel\.|/tracking[._\-/]|[._\-/]tracking\.|"
    r"placeholder|gravatar\.com/avatar|/avatar[._\-/]?|[._\-/]avatar\.|"
    r"[._\-/]icon[._\-/]?|/icon\.|/logo\.|[._\-/]logo[._\-/]?|"
    r"sprite|blank\.gif|clear\.gif|transparent\.gif|spacer|\.svg(\?|$))",
    re.IGNORECASE,
)

# Max redirects to follow before giving up
_MAX_REDIRECTS = 5


def _is_trusted_domain(url: str) -> bool:
    """Return True if *url* is on a domain we always trust."""
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc in _TRUSTED_DOMAINS
    except Exception:
        return False


async def is_valid_image_url(url: str | None, timeout: float = 5.0) -> bool:
    """
    Return True if *url* is a valid, usable image.

    Performs checks in order of cost:
    1. Null / empty check (free).
    2. Known-noise URL pattern check (free).
    3. Trusted-CDN fast-path — skip network call (free).
    4. HTTP HEAD request to verify status, content-type, and size.
    """
    if not url:
        return False

    # 1. Noise pattern
    if _NOISE_RE.search(url):
        logger.debug("is_valid_image_url: noise pattern in %s", url[:120])
        return False

    # 2. Trusted CDN fast-path
    if _is_trusted_domain(url):
        return True

    # 3. HEAD request
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            max_redirects=_MAX_REDIRECTS,
        ) as client:
            resp = await client.head(url)

        if resp.status_code >= 400:
            logger.debug(
                "is_valid_image_url: HTTP %d for %s", resp.status_code, url[:120]
            )
            return False

        ct = resp.headers.get("content-type", "")
        if not ct.lower().startswith("image/"):
            logger.debug(
                "is_valid_image_url: non-image content-type %r for %s", ct, url[:120]
            )
            return False

        cl = resp.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) < MIN_SIZE_BYTES:
                    logger.debug(
                        "is_valid_image_url: too small (%s bytes) for %s", cl, url[:120]
                    )
                    return False
            except ValueError:
                pass  # malformed Content-Length — treat as unknown, continue

        return True

    except Exception:
        logger.debug("is_valid_image_url: request failed for %s", url[:120], exc_info=True)
        return False


async def validate_and_fix_article_image(
    article_id: int,
    current_url: str | None,
    keywords: "str | list[str]",
    site_default_images: list[str] | None = None,
) -> str | None:
    """
    Return a validated image URL for the article.

    Algorithm:
    1. If *current_url* passes validation → return it unchanged.
    2. Call ``enrich_article_images(article_id, keywords)`` — when *keywords* is
       a ``list[str]`` (e.g. site scrape keywords), the most-specific term is
       tried first; subsequent entries are used only as fallbacks.
    3. Fallback: return first valid URL from *site_default_images*.
    4. If all fail: return None.

    Args:
        article_id:          Used for logging.
        current_url:         Existing ``main_image_url`` (may be None).
        keywords:            Str or ordered list[str] for the Unsplash query
                             (site scrape keywords preferred).
        site_default_images: Pre-curated URLs from ``site.config.default_images``.

    Returns:
        A validated URL string, or None if no valid image could be obtained.
    """
    from app.services.image_service import enrich_article_images

    # Step 1 — validate existing URL
    if await is_valid_image_url(current_url):
        return current_url

    if current_url:
        logger.info(
            "validate_and_fix: article %d has invalid image (%s…), fetching replacement",
            article_id,
            current_url[:60],
        )
    else:
        logger.info(
            "validate_and_fix: article %d has no image, fetching from Unsplash",
            article_id,
        )

    # Step 2 — Unsplash (handles list ordering internally: specific → broad)
    url = await enrich_article_images(article_id, keywords)
    if url and await is_valid_image_url(url):
        logger.info("validate_and_fix: article %d fixed via Unsplash", article_id)
        return url

    # Step 3 — site default images fallback
    if site_default_images:
        for img in site_default_images:
            if await is_valid_image_url(img):
                logger.info(
                    "validate_and_fix: article %d using site default image", article_id
                )
                return img

    logger.warning(
        "validate_and_fix: could not obtain a valid image for article %d", article_id
    )
    return None
