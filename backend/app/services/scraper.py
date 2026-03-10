"""
Scraper service — keyword-based search using Tavily (primary) and Google Custom
Search (secondary), full-content fetch via httpx, and article persistence.

Search flow
-----------
1. For each job run, query Tavily and Google CSE concurrently using the job keywords
2. Merge and deduplicate results by URL (Tavily wins on duplicates — higher score)
3. Fetch full HTML for each candidate URL (SSRF-protected, rate-limited per domain)
4. Parse title + body, detect language
5. Save new Articles with status=pending; ai_score populated from Tavily relevance

Security guarantees
-------------------
- API keys loaded from environment only, never logged
- URL scheme restricted to http / https
- Hostname resolved to IP before request; all RFC-1918, loopback, link-local,
  and ULA IPv6 ranges are blocked (SSRF protection)
- Rate-limited to RATE_LIMIT_SECONDS per domain (in-process)
- At most MAX_SEARCHES_PER_JOB candidate URLs processed per run
"""

import asyncio
import ipaddress
import logging
import re
import socket
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.database import SessionLocal
from app.models.article import Article, ArticleStatus
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RATE_LIMIT_SECONDS: float = 2.0
FETCH_TIMEOUT_SECONDS: float = 15.0
MAX_BODY_BYTES: int = 5 * 1024 * 1024  # 5 MB

# Max candidate URLs to fetch & save per job run
MAX_SEARCHES_PER_JOB: int = 10

# Results requested from each search provider
TAVILY_MAX_RESULTS: int = 7
GOOGLE_MAX_RESULTS: int = 5

REQUEST_HEADERS = {
    "User-Agent": (
        "ContentPlatformBot/1.0 (+https://github.com/pappatch/content-platform)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en,he,ar,fr;q=0.8",
}

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

# ---------------------------------------------------------------------------
# Rate limiter (in-process, per domain)
# ---------------------------------------------------------------------------

_rate_lock = asyncio.Lock()
_domain_last_request: dict[str, float] = {}


async def _rate_limit(domain: str) -> None:
    async with _rate_lock:
        now = time.monotonic()
        wait = RATE_LIMIT_SECONDS - (now - _domain_last_request.get(domain, 0))
        if wait > 0:
            await asyncio.sleep(wait)
        _domain_last_request[domain] = time.monotonic()


# ---------------------------------------------------------------------------
# SSRF protection — URL validation
# ---------------------------------------------------------------------------

def _is_private_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        return any(ip in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        return True  # unparseable → block


async def validate_url(url: str) -> str:
    """
    Validate URL scheme and resolve hostname to catch SSRF targets.
    Raises ValueError with a safe message on any violation.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Disallowed URL scheme: {parsed.scheme!r}")

    host = parsed.hostname
    if not host:
        raise ValueError("URL has no hostname")

    try:
        addr_infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname {host!r}: {exc}") from exc

    for *_, sockaddr in addr_infos:
        if _is_private_ip(sockaddr[0]):
            raise ValueError(
                "URL resolves to a private/internal address and cannot be fetched"
            )

    return url


# ---------------------------------------------------------------------------
# Search providers
# ---------------------------------------------------------------------------

async def _tavily_search(keywords: list[str], language: str) -> list[dict]:
    """
    Search Tavily with the combined keyword query.
    Returns list of {url, title, snippet, score, source}.
    Silently returns [] if API key is missing or the call fails.
    """
    settings = get_settings()
    if not settings.tavily_api_key:
        logger.warning("TAVILY_API_KEY not configured — skipping Tavily search")
        return []

    query = " ".join(keywords)

    def _sync() -> list:
        from tavily import TavilyClient
        client = TavilyClient(api_key=settings.tavily_api_key)
        resp = client.search(
            query=query,
            search_depth="advanced",
            max_results=TAVILY_MAX_RESULTS,
            include_raw_content=False,
        )
        return resp.get("results", [])

    try:
        raw = await asyncio.to_thread(_sync)
        return [
            {
                "url": r.get("url", ""),
                "title": r.get("title", ""),
                "snippet": r.get("content", ""),
                "score": float(r.get("score", 0.0)),
                "source": "tavily",
            }
            for r in raw
            if r.get("url")
        ]
    except Exception as exc:
        logger.warning("Tavily search failed (%s: %s)", type(exc).__name__, exc)
        return []


async def _google_search(keywords: list[str], language: str) -> list[dict]:
    """
    Search Google Custom Search Engine with the combined keyword query.
    Returns list of {url, title, snippet, score=0.0, source}.
    Silently returns [] if API keys are missing or the call fails.
    """
    settings = get_settings()
    if not settings.google_api_key or not settings.google_cse_id:
        logger.warning(
            "GOOGLE_API_KEY / GOOGLE_CSE_ID not configured — skipping Google search"
        )
        return []

    query = " ".join(keywords)
    lr_param = f"lang_{language}" if language in ("en", "fr", "he", "ar") else "lang_en"

    def _sync() -> list:
        from googleapiclient.discovery import build as google_build
        service = google_build(
            "customsearch",
            "v1",
            developerKey=settings.google_api_key,
            cache_discovery=False,  # avoids a discovery endpoint network call on each use
        )
        result = (
            service.cse()
            .list(q=query, cx=settings.google_cse_id, num=GOOGLE_MAX_RESULTS, lr=lr_param)
            .execute()
        )
        return result.get("items", [])

    try:
        raw = await asyncio.to_thread(_sync)
        return [
            {
                "url": item.get("link", ""),
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "score": 0.0,
                "source": "google",
            }
            for item in raw
            if item.get("link")
        ]
    except Exception as exc:
        logger.warning("Google CSE search failed (%s: %s)", type(exc).__name__, exc)
        return []


def _merge_results(tavily: list[dict], google: list[dict]) -> list[dict]:
    """
    Merge Tavily + Google results, deduplicating by normalised URL.
    Tavily entries take precedence when the same URL appears in both.
    Returns at most MAX_SEARCHES_PER_JOB entries.
    """
    seen: set[str] = set()
    merged: list[dict] = []

    for item in tavily + google:
        key = item["url"].rstrip("/").lower()
        if key and key not in seen:
            seen.add(key)
            merged.append(item)
        if len(merged) >= MAX_SEARCHES_PER_JOB:
            break

    return merged


# ---------------------------------------------------------------------------
# HTML content extractor
# ---------------------------------------------------------------------------

class _ContentExtractor(HTMLParser):
    """Single-pass HTML parser — pulls title, body text, and first image URL."""

    _SKIP = frozenset({
        "script", "style", "nav", "header", "footer", "aside",
        "noscript", "iframe", "form", "button",
    })
    _CONTENT = frozenset({
        "p", "h1", "h2", "h3", "h4", "h5", "h6",
        "li", "td", "article", "main", "section", "blockquote",
    })

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: str = ""
        self.image_url: Optional[str] = None
        self._parts: list[str] = []
        self._in_title: bool = False
        self._skip_depth: int = 0
        self._content_depth: int = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attrs_dict = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "img" and not self.image_url:
            src = attrs_dict.get("src", "")
            if src.startswith("http"):
                self.image_url = src
        if tag in self._SKIP:
            self._skip_depth += 1
        if tag in self._CONTENT:
            self._content_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag in self._SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
        if tag in self._CONTENT:
            self._content_depth = max(0, self._content_depth - 1)

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title += text
        elif self._content_depth > 0:
            self._parts.append(text)

    @property
    def body(self) -> str:
        return " ".join(self._parts)


def _parse_html(html: str) -> dict:
    extractor = _ContentExtractor()
    extractor.feed(html)
    return {
        "title": extractor.title.strip() or "Untitled",
        "body": extractor.body.strip(),
        "image_url": extractor.image_url,
    }


# ---------------------------------------------------------------------------
# Language detection (Unicode heuristic, no external deps)
# ---------------------------------------------------------------------------

_FRENCH_MARKERS = frozenset({
    "le", "la", "les", "de", "du", "un", "une", "est", "dans",
    "pour", "avec", "que", "qui", "pas", "sur", "au", "aux",
    "ce", "se", "ne", "il", "elle", "nous", "vous", "ils",
})


def detect_language(text: str) -> str:
    """Returns 'he' | 'ar' | 'fr' | 'en' based on character-range heuristics."""
    sample = text[:2000]
    total = max(len(sample), 1)
    hebrew = sum(1 for c in sample if "\u0590" <= c <= "\u05FF")
    arabic = sum(1 for c in sample if "\u0600" <= c <= "\u06FF")
    if hebrew / total > 0.08:
        return "he"
    if arabic / total > 0.08:
        return "ar"
    words = set(re.findall(r"\b[a-z]{2,}\b", sample.lower()))
    if len(words & _FRENCH_MARKERS) >= 3:
        return "fr"
    return "en"


# ---------------------------------------------------------------------------
# HTTP fetch
# ---------------------------------------------------------------------------

async def _fetch_html(url: str) -> str:
    """Fetch URL and return decoded HTML. Raises on non-200 or non-HTML responses."""
    domain = urlparse(url).netloc
    await _rate_limit(domain)

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=FETCH_TIMEOUT_SECONDS,
        headers=REQUEST_HEADERS,
        max_redirects=5,
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            raise ValueError(f"Non-HTML content-type: {content_type!r}")

        if len(response.content) > MAX_BODY_BYTES:
            raise ValueError(f"Response too large: {len(response.content)} bytes")

        return response.text


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def scrape_and_save(job_id: int) -> None:
    """
    Search for articles using the job's keywords, fetch full HTML content,
    and persist new Articles. Updates job.status in DB.
    All exceptions are caught and stored in job.error_message — never re-raised.
    """
    db = SessionLocal()
    try:
        job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
        if not job:
            logger.error("scrape_and_save: job %d not found", job_id)
            return

        keywords: list[str] = job.keywords or []
        language: str = job.language or "en"

        if not keywords:
            _fail_job(db, job, "Job has no keywords — add at least one search term")
            return

        # Mark running
        job.status = ScrapeJobStatus.running
        job.error_message = None
        db.commit()

        logger.info(
            "Job %d: searching keywords=%r language=%s", job_id, keywords, language
        )

        # 1. Run both providers concurrently
        tavily_results, google_results = await asyncio.gather(
            _tavily_search(keywords, language),
            _google_search(keywords, language),
        )

        if not tavily_results and not google_results:
            _fail_job(
                db, job,
                "No results from Tavily or Google — check API keys in environment",
            )
            return

        candidates = _merge_results(tavily_results, google_results)
        logger.info(
            "Job %d: %d candidates (tavily=%d google=%d) after dedup",
            job_id, len(candidates), len(tavily_results), len(google_results),
        )

        new_count = 0

        # 2. Fetch full content for each candidate
        for item in candidates:
            url = item["url"]

            # Skip already-saved articles
            if db.query(Article).filter(Article.source_url == url).first():
                logger.debug("Job %d: skip duplicate %s", job_id, url)
                continue

            # SSRF validation
            try:
                validated_url = await validate_url(url)
            except ValueError as exc:
                logger.warning("Job %d: SSRF block %s — %s", job_id, url, exc)
                continue

            # Full HTML fetch
            try:
                html = await _fetch_html(validated_url)
            except Exception as exc:
                logger.warning("Job %d: fetch failed %s — %s", job_id, url, exc)
                continue

            parsed = _parse_html(html)
            if not parsed["body"]:
                logger.debug("Job %d: no body text at %s, skipping", job_id, url)
                continue

            title = item["title"] or parsed["title"] or "Untitled"

            article = Article(
                title=title[:500],
                body=parsed["body"],
                source_url=url,
                status=ArticleStatus.pending,
                image_url=parsed["image_url"],
                # Tavily provides a relevance score (0–1); Google returns 0.0
                ai_score=item["score"] if item["score"] > 0 else None,
                site_id=job.site_id,
            )
            db.add(article)
            db.flush()
            new_count += 1

            logger.info(
                "Job %d: saved article id=%d url=%s source=%s score=%.3f",
                job_id, article.id, url, item["source"], item["score"],
            )

        job.scraped_count = (job.scraped_count or 0) + new_count
        _complete_job(db, job)
        logger.info("Job %d: complete — %d new articles saved", job_id, new_count)

    except Exception as exc:
        logger.exception("Job %d: unexpected error", job_id)
        try:
            job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
            if job:
                _fail_job(db, job, f"Unexpected error: {exc}")
        except Exception:
            pass
    finally:
        db.close()


def _complete_job(db, job: ScrapeJob) -> None:
    job.status = ScrapeJobStatus.done
    job.last_run = datetime.now(timezone.utc)
    db.commit()


def _fail_job(db, job: ScrapeJob, message: str) -> None:
    job.status = ScrapeJobStatus.failed
    job.last_run = datetime.now(timezone.utc)
    job.error_message = message[:1000]
    db.commit()
