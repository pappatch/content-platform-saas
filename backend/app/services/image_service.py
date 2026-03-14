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

Duplicate prevention
--------------------
``enrich_article_images`` accepts an optional ``excluded_urls`` set.  Each
Unsplash call fetches up to 10 candidates (``per_page=10``) and returns the
first URL not already present in ``excluded_urls``.  If all 10 candidates are
excluded, the next page is tried (up to ``_MAX_CANDIDATE_PAGES`` pages).
This prevents the same Unsplash photo from being assigned to multiple articles
on the same site.

Security invariants
-------------------
- API key read exclusively from Settings (environment variable); never hardcoded.
- Network errors / bad responses are caught and logged; never propagated to callers.
- Returned URLs are Unsplash CDN URLs (images.unsplash.com) — no SSRF risk for
  client-side consumption.
"""

import logging
import re
from typing import Union

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos"
_CANDIDATES_PER_PAGE = 10   # results fetched per API call
_MAX_CANDIDATE_PAGES = 3    # pages tried before giving up on a query

# Matches the Unsplash photo ID in a CDN URL, e.g. "photo-1721781060617-2c451646fee7"
_UNSPLASH_PHOTO_ID_RE = re.compile(r"photo-[a-f0-9]+-[a-f0-9]+", re.IGNORECASE)


def _unsplash_photo_key(url: str) -> str:
    """
    Normalise an Unsplash URL to its stable photo ID for deduplication.

    Unsplash CDN URLs for the same photo can differ in ``ixid``, ``ixlib``,
    ``w``, etc. — all varying between API calls.  The photo slug
    (``photo-<hex>-<hex>``) is the only stable identifier.

    Falls back to the full URL if no photo ID is found (non-Unsplash URLs).
    """
    m = _UNSPLASH_PHOTO_ID_RE.search(url)
    return m.group(0).lower() if m else url


async def _fetch_unsplash_candidates(
    article_id: int,
    query: str,
    page: int = 1,
) -> list[str]:
    """
    Make one Unsplash Search API call and return up to ``_CANDIDATES_PER_PAGE`` URLs.

    Returns an empty list on any error or when no results are found.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _UNSPLASH_SEARCH_URL,
                params={
                    "query":          query[:200],
                    "per_page":       _CANDIDATES_PER_PAGE,
                    "page":           page,
                    "orientation":    "landscape",
                    "content_filter": "high",
                },
                headers={"Authorization": f"Client-ID {settings.unsplash_access_key}"},
            )
            resp.raise_for_status()

        data = resp.json()
        results = data.get("results") or []
        urls = [r["urls"]["regular"] for r in results if r.get("urls", {}).get("regular")]

        if not urls:
            logger.debug(
                "_fetch_unsplash_candidates: no results for article %d (query=%r, page=%d)",
                article_id, query[:80], page,
            )
        else:
            logger.debug(
                "_fetch_unsplash_candidates: article %d got %d candidates (query=%r, page=%d)",
                article_id, len(urls), query[:60], page,
            )

        return urls

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "_fetch_unsplash_candidates: HTTP %d for article %d",
            exc.response.status_code, article_id,
        )
    except Exception:
        logger.warning(
            "_fetch_unsplash_candidates: failed for article %d",
            article_id, exc_info=True,
        )
    return []


async def enrich_article_images(
    article_id: int,
    keywords: Union[str, list[str]],
    excluded_urls: set[str] | None = None,
) -> str | None:
    """
    Search Unsplash for a landscape photo and return its URL.

    *keywords* can be:
    - A ``list[str]``: tried in order, most-specific first.  Returns the first
      hit; later entries are only attempted when an earlier query returns no
      usable results.
    - A plain ``str``: single query, same behaviour as before.

    *excluded_urls* — optional set of URLs already in use on the same site.
    When provided, any candidate matching an excluded URL is skipped; the next
    candidate (or next page) is tried instead.  If every candidate across all
    pages is excluded, the last candidate is returned as a last resort (a
    duplicate image is better than no image).

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

    # Normalise excluded_urls to photo-ID keys so that the same Unsplash photo
    # returned with different query-string parameters is still recognised as a duplicate.
    excluded_keys: set[str] = {_unsplash_photo_key(u) for u in (excluded_urls or set())}
    last_resort: str | None = None

    for query in queries:
        for page in range(1, _MAX_CANDIDATE_PAGES + 1):
            candidates = await _fetch_unsplash_candidates(article_id, query, page=page)
            if not candidates:
                break  # no more results for this query — try next keyword

            for url in candidates:
                if _unsplash_photo_key(url) not in excluded_keys:
                    logger.info(
                        "enrich_article_images: article %d → %s… (query=%r, page=%d)",
                        article_id, url[:60], query[:50], page,
                    )
                    return url
                # this candidate is excluded — keep it as last-resort fallback
                last_resort = url

            # all candidates on this page were excluded — try next page
            logger.debug(
                "enrich_article_images: all %d candidates excluded for article %d "
                "(query=%r, page=%d), trying next page",
                len(candidates), article_id, query[:50], page,
            )

    # All queries exhausted with all candidates excluded — accept the last seen URL
    # rather than returning None (duplicate is preferable to a broken/missing image).
    if last_resort:
        logger.warning(
            "enrich_article_images: article %d — could not find a unique image; "
            "using last-resort URL %s…",
            article_id, last_resort[:60],
        )
        return last_resort

    return None
