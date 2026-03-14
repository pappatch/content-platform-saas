"""
Image enrichment service — fetches a relevant image from Unsplash when an
article has no main_image_url.

Flow
----
1. Caller passes article_id and a keyword string (title or SEO keywords).
2. If UNSPLASH_ACCESS_KEY is not configured, returns None immediately.
3. Queries Unsplash Search API for one landscape photo matching the keywords.
4. Returns the "regular" size URL, or None on any failure.

Security invariants
-------------------
- API key read exclusively from Settings (environment variable); never hardcoded.
- Network errors / bad responses are caught and logged; never propagated to callers.
- Returned URLs are Unsplash CDN URLs (images.unsplash.com) — no SSRF risk for
  client-side consumption.
"""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"


async def enrich_article_images(article_id: int, keywords: str) -> str | None:
    """
    Search Unsplash for a landscape photo matching *keywords* and return its URL.

    Returns None if:
    - UNSPLASH_ACCESS_KEY is not set
    - Unsplash returns no results
    - Any network or API error occurs
    """
    if not settings.unsplash_access_key:
        logger.debug(
            "enrich_article_images: UNSPLASH_ACCESS_KEY not configured, skipping article %d",
            article_id,
        )
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _UNSPLASH_SEARCH_URL,
                params={
                    "query": keywords[:200],  # cap query length
                    "per_page": 1,
                    "orientation": "landscape",
                    "content_filter": "high",
                },
                headers={"Authorization": f"Client-ID {settings.unsplash_access_key}"},
            )
            resp.raise_for_status()

        data = resp.json()
        results = data.get("results") or []
        if not results:
            logger.debug(
                "enrich_article_images: no Unsplash results for article %d (query=%r)",
                article_id,
                keywords[:80],
            )
            return None

        url: str = results[0]["urls"]["regular"]
        logger.info(
            "enrich_article_images: article %d assigned Unsplash image %s",
            article_id,
            url,
        )
        return url

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "enrich_article_images: Unsplash HTTP %d for article %d",
            exc.response.status_code,
            article_id,
        )
    except Exception:
        logger.warning(
            "enrich_article_images: failed to fetch image for article %d",
            article_id,
            exc_info=True,
        )

    return None
