"""
Image enrichment service — fetches a relevant image from Unsplash when an
article has no main_image_url.

Flow
----
1. Caller passes article_id and keywords (str or ordered list[str]).
2. If UNSPLASH_ACCESS_KEY is not configured, returns None immediately.
3. Queries Unsplash Search API, preferring the most-specific keyword first;
   broadens to subsequent keywords only when a query returns no results.
4. Returns the "regular" size URL, or None on any failure.

Security invariants
-------------------
- API key read exclusively from Settings (environment variable); never hardcoded.
- Network errors / bad responses are caught and logged; never propagated to callers.
- Returned URLs are Unsplash CDN URLs (images.unsplash.com) — no SSRF risk for
  client-side consumption.
"""

import logging
from typing import Union

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"


async def _fetch_unsplash(article_id: int, query: str) -> str | None:
    """
    Make a single Unsplash Search API call for *query* and return the first URL.

    Returns None if the query has no results or any error occurs.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _UNSPLASH_SEARCH_URL,
                params={
                    "query": query[:200],
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
                "_fetch_unsplash: no results for article %d (query=%r)",
                article_id,
                query[:80],
            )
            return None

        url: str = results[0]["urls"]["regular"]
        logger.info(
            "_fetch_unsplash: article %d → %s (query=%r)",
            article_id,
            url,
            query[:60],
        )
        return url

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "_fetch_unsplash: Unsplash HTTP %d for article %d",
            exc.response.status_code,
            article_id,
        )
    except Exception:
        logger.warning(
            "_fetch_unsplash: failed for article %d",
            article_id,
            exc_info=True,
        )
    return None


async def enrich_article_images(
    article_id: int,
    keywords: Union[str, list[str]],
) -> str | None:
    """
    Search Unsplash for a landscape photo and return its URL.

    *keywords* can be:
    - A ``list[str]``: tried in order, most-specific first.  Returns the first
      hit; later entries are only attempted when an earlier query returns no
      results.  This ensures site-specific terms (e.g. "bonsai tree") are
      preferred over generic fallbacks (e.g. "nature").
    - A plain ``str``: single query, same behaviour as before.

    Returns None if UNSPLASH_ACCESS_KEY is not set or all queries fail.
    """
    if not settings.unsplash_access_key:
        logger.debug(
            "enrich_article_images: UNSPLASH_ACCESS_KEY not configured, skipping article %d",
            article_id,
        )
        return None

    if isinstance(keywords, list):
        queries = [k.strip() for k in keywords if k and k.strip()]
    else:
        q = (keywords or "").strip()[:200]
        queries = [q] if q else []

    if not queries:
        queries = ["photography"]

    for query in queries:
        url = await _fetch_unsplash(article_id, query)
        if url:
            return url

    return None
