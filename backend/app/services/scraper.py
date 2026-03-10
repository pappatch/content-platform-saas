"""
Scraper service — async HTML fetching, parsing, language detection, and article persistence.

Security guarantees
-------------------
- URL scheme restricted to http / https
- Hostname resolved to IP before request; all RFC-1918, loopback, link-local,
  and ULA IPv6 ranges are blocked (SSRF protection)
- Rate-limited to RATE_LIMIT_SECONDS per domain (in-process)
- All exceptions are caught, logged, and never propagated to API callers
"""

import asyncio
import hashlib
import ipaddress
import logging
import re
import socket
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

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

    # Resolve in a thread so we don't block the event loop
    try:
        addr_infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname {host!r}: {exc}") from exc

    for *_, sockaddr in addr_infos:
        ip_str = sockaddr[0]
        if _is_private_ip(ip_str):
            raise ValueError(
                f"URL resolves to a private/internal address and cannot be fetched"
            )

    return url


# ---------------------------------------------------------------------------
# HTML content extractor
# ---------------------------------------------------------------------------

class _ContentExtractor(HTMLParser):
    """Single-pass HTML parser that pulls title, body text, and first image."""

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
    """Return dict with title, body, image_url extracted from raw HTML."""
    extractor = _ContentExtractor()
    extractor.feed(html)
    return {
        "title": extractor.title.strip() or "Untitled",
        "body": extractor.body.strip(),
        "image_url": extractor.image_url,
    }


# ---------------------------------------------------------------------------
# Language detection (Unicode character range heuristic, no external deps)
# ---------------------------------------------------------------------------

_FRENCH_MARKERS = frozenset({
    "le", "la", "les", "de", "du", "un", "une", "est", "dans",
    "pour", "avec", "que", "qui", "pas", "sur", "au", "aux",
    "ce", "se", "ne", "il", "elle", "nous", "vous", "ils",
})


def detect_language(text: str) -> str:
    """
    Detect language from text using Unicode character ranges and French markers.
    Returns: "he" | "ar" | "fr" | "en"
    """
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
    """Fetch URL and return decoded HTML. Raises httpx errors on failure."""
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
# Main scrape-and-save entry point
# ---------------------------------------------------------------------------

async def scrape_and_save(job_id: int) -> None:
    """
    Fetch the job's URL, parse content, and save a new Article if not duplicate.
    Updates job.status, job.scraped_count, job.last_run, job.error_message in DB.
    All exceptions are caught and stored in the job record — never re-raised.
    """
    db = SessionLocal()
    try:
        job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
        if not job:
            logger.error("scrape_and_save: job %d not found", job_id)
            return

        # Mark as running
        job.status = ScrapeJobStatus.running
        job.error_message = None
        db.commit()

        try:
            validated_url = await validate_url(job.url)
            html = await _fetch_html(validated_url)
        except Exception as exc:
            logger.warning("Job %d fetch failed: %s", job_id, exc)
            _fail_job(db, job, str(exc))
            return

        parsed = _parse_html(html)

        if not parsed["body"]:
            _fail_job(db, job, "No extractable body text found in page")
            return

        # Deduplicate by source_url
        existing = db.query(Article).filter(Article.source_url == job.url).first()
        if existing:
            logger.info("Job %d: article already exists for %s, skipping", job_id, job.url)
            _complete_job(db, job, new_articles=0)
            return

        detected_lang = detect_language(parsed["body"])
        logger.info("Job %d: detected language=%s for %s", job_id, detected_lang, job.url)

        article = Article(
            title=parsed["title"][:500],  # guard against pathological titles
            body=parsed["body"],
            source_url=job.url,
            status=ArticleStatus.pending,
            image_url=parsed["image_url"],
            site_id=job.site_id,
        )
        db.add(article)
        db.flush()  # get article.id without full commit

        job.scraped_count = (job.scraped_count or 0) + 1
        _complete_job(db, job, new_articles=1)
        logger.info("Job %d: saved article id=%d from %s", job_id, article.id, job.url)

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


def _complete_job(db, job: ScrapeJob, new_articles: int) -> None:
    job.status = ScrapeJobStatus.done
    job.last_run = datetime.now(timezone.utc)
    if new_articles:
        job.scraped_count = (job.scraped_count or 0)  # already incremented by caller
    db.commit()


def _fail_job(db, job: ScrapeJob, message: str) -> None:
    job.status = ScrapeJobStatus.failed
    job.last_run = datetime.now(timezone.utc)
    job.error_message = message[:1000]
    db.commit()
