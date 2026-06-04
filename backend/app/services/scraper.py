"""
Scraper service — keyword-based search using Tavily (primary) and Google Custom
Search (secondary), full-content fetch via httpx, and article persistence.

Search flow
-----------
1. For each job run, query Tavily and Google CSE concurrently using the job keywords
2. Merge and deduplicate results by URL (Tavily wins on duplicates — higher score)
3. Fetch full HTML for each candidate URL (SSRF-protected, rate-limited per domain)
4. Parse HTML into ordered content blocks (headings, paragraphs, images, quotes)
5. Quality check: skip if < 3 paragraph blocks or < 100 words total
6. Save Article with content_html; ai_score populated from Tavily relevance

Security guarantees
-------------------
- API keys loaded from environment only, never logged
- URL scheme restricted to http / https
- Hostname resolved to IP before request; all RFC-1918, loopback, link-local,
  and ULA IPv6 ranges are blocked (SSRF protection)
- Rate-limited to RATE_LIMIT_SECONDS per domain (in-process)
- At most MAX_SEARCHES_PER_JOB candidate URLs processed per run
- Block content sanitized before saving
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
from app.services import settings_service
from app.services.usage_service import log_api_call
from app.models.article import Article, ArticleStatus
from app.models.article_block import BlockType
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
from app.utils.sanitize import sanitize_html, sanitize_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RATE_LIMIT_SECONDS: float = 2.0
FETCH_TIMEOUT_SECONDS: float = 15.0
MAX_BODY_BYTES: int = 5 * 1024 * 1024  # 5 MB

# Fallback constants — used only if the platform_settings DB is unavailable.
# The live values are read from settings_service at call time.
_DEFAULT_MAX_SEARCHES: int = 10
_DEFAULT_MIN_PARAGRAPHS: int = 3
_DEFAULT_MIN_WORDS: int = 100
_DEFAULT_TAVILY_MAX_RESULTS: int = 7
_DEFAULT_GOOGLE_MAX_RESULTS: int = 5

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
            max_results=settings_service.get("scraper_tavily_max_results", _DEFAULT_TAVILY_MAX_RESULTS),
            include_raw_content=False,
        )
        return resp.get("results", [])

    try:
        raw = await asyncio.to_thread(_sync)
        results = [
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
        log_api_call("tavily", "search", success=True,
                     meta={"results": len(results), "keywords": " ".join(keywords[:3])})
        return results
    except Exception as exc:
        logger.warning("Tavily search failed (%s: %s)", type(exc).__name__, exc)
        log_api_call("tavily", "search", success=False,
                     meta={"error": type(exc).__name__})
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
            cache_discovery=False,
        )
        result = (
            service.cse()
            .list(q=query, cx=settings.google_cse_id, num=settings_service.get("scraper_google_max_results", _DEFAULT_GOOGLE_MAX_RESULTS), lr=lr_param)
            .execute()
        )
        return result.get("items", [])

    try:
        raw = await asyncio.to_thread(_sync)
        results = [
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
        log_api_call("google_cse", "search", success=True,
                     meta={"results": len(results), "keywords": " ".join(keywords[:3])})
        return results
    except Exception as exc:
        logger.warning("Google CSE search failed (%s: %s)", type(exc).__name__, exc)
        log_api_call("google_cse", "search", success=False,
                     meta={"error": type(exc).__name__})
        return []


def _merge_results(tavily: list[dict], google: list[dict]) -> list[dict]:
    """
    Merge Tavily + Google results, deduplicating by normalised URL.
    Tavily entries take precedence when the same URL appears in both.
    Returns at most MAX_SEARCHES_PER_JOB entries.
    """
    seen: set[str] = set()
    merged: list[dict] = []

    max_searches = settings_service.get("max_searches_per_job", _DEFAULT_MAX_SEARCHES)
    for item in tavily + google:
        key = item["url"].rstrip("/").lower()
        if key and key not in seen:
            seen.add(key)
            merged.append(item)
        if len(merged) >= max_searches:
            break

    return merged


# ---------------------------------------------------------------------------
# Block-based HTML content extractor
# ---------------------------------------------------------------------------

# Tags whose entire subtree should be skipped unconditionally.
# IMPORTANT: only include non-void elements (i.e. tags that have a matching
# closing tag).  Void elements like <meta> and <link> never fire handle_endtag,
# so including them would permanently increment _skip_depth with no matching
# decrement, causing the rest of the document to be silently ignored.
_SKIP_TAGS = frozenset({
    "script", "style", "nav", "header", "footer", "aside",
    "noscript", "iframe", "form", "button", "select", "textarea",
    "head",
})

# Class/id fragments that mark a div/section as boilerplate — checked against
# both the `class` and `id` attributes of div/section elements.
_NOISE_DIV_FRAGMENTS = frozenset({
    "sidebar", "widget", "banner", "cookie", "gdpr", "alert",
    "notification", "newsletter", "subscribe", "promo", "advertisement",
    "breadcrumb", "pagination", "comment", "related",
    "footer", "header", "nav", "menu", "share", "social",
})

# Single-word class/id fragments that indicate a div/section is the main
# content container.  Matched as substrings so "post-body", "post_body",
# "postbody" all match "post" and "body".
_CONTENT_DIV_HINTS = frozenset({
    "article", "content", "post", "entry", "story", "body", "text", "main",
})

# Heading tag → (block_type, level)
_HEADING_MAP = {
    "h1": (BlockType.heading, 1),
    "h2": (BlockType.heading, 2),
    "h3": (BlockType.subheading, 3),
    "h4": (BlockType.subheading, 4),
}

_PARAGRAPH_TAGS = frozenset({"p", "li", "dd"})
_BLOCK_TAGS = frozenset(_HEADING_MAP) | _PARAGRAPH_TAGS | {"blockquote", "figcaption"}

# Extractor modes, tried in order until quality passes
_MODE_SEMANTIC = "semantic"      # article / main / role=main / known class strings
_MODE_DIV      = "div_content"   # + div/section with a _CONTENT_DIV_HINTS fragment
_MODE_BODY     = "body"          # entire body minus skip-tags and noise divs


def _cls_id(attrs_dict: dict) -> str:
    """Return a combined lowercase string of class + id for fragment matching."""
    return attrs_dict.get("class", "").lower() + " " + attrs_dict.get("id", "").lower()


def _is_noise_div(tag: str, attrs_dict: dict) -> bool:
    """
    Return True if this div/section element is boilerplate.
    Checks both class and id attributes.
    Also blocks ARIA roles that signal non-content regions.
    """
    if tag not in ("div", "section"):
        return False
    role = attrs_dict.get("role", "").lower()
    if role in ("navigation", "banner", "complementary", "contentinfo", "search"):
        return True
    combined = _cls_id(attrs_dict)
    return any(frag in combined for frag in _NOISE_DIV_FRAGMENTS)


def _is_semantic_container(tag: str, attrs_dict: dict) -> bool:
    """Tier-1: HTML5 semantic tags and well-known CMS class strings."""
    if tag in ("article", "main"):
        return True
    role = attrs_dict.get("role", "").lower()
    if role == "main":
        return True
    cls = attrs_dict.get("class", "").lower()
    for hint in ("article-body", "article-content", "post-content",
                 "entry-content", "story-body", "content-body"):
        if hint in cls:
            return True
    return False


def _is_content_div(tag: str, attrs_dict: dict) -> bool:
    """
    Tier-2: div/section whose class or id contains a content-hint word.
    Only called when _is_semantic_container() returned False.
    """
    if tag not in ("div", "section"):
        return False
    combined = _cls_id(attrs_dict)
    return any(hint in combined for hint in _CONTENT_DIV_HINTS)


class _ParsedBlock:
    __slots__ = ("block_type", "content", "level", "metadata")

    def __init__(self, block_type: BlockType, content: str,
                 level: Optional[int] = None, metadata: Optional[dict] = None):
        self.block_type = block_type
        self.content = content
        self.level = level
        self.metadata = metadata


class _BlockExtractor(HTMLParser):
    """
    Single-pass block extractor operating in one of three modes:

    "semantic"    — collect only inside article/main/role=main and well-known CMS
                    class strings.  Most accurate, lowest noise.
    "div_content" — additionally recognise div/section elements whose class or id
                    contains a content-hint word (article, content, post, …).
                    Handles div-based CMS layouts.
    "body"        — collect everywhere in <body>, skipping only _SKIP_TAGS and
                    noise div/section elements.  Last-resort fallback.

    In every mode, noise divs (nav, sidebar, comment, …) are still skipped.
    """

    def __init__(self, mode: str = _MODE_SEMANTIC) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[_ParsedBlock] = []
        self.title: str = ""
        self.main_image_url: Optional[str] = None

        self._mode = mode
        self._skip_depth: int = 0   # inside a skipped subtree
        self._main_depth: int = 0   # inside a recognised content container
        # Stack tracking whether each opened div/section was a noise element.
        # Required because handle_endtag receives no attributes, so we cannot
        # call _is_noise_div() on close — every open must be paired with a pop.
        self._div_stack: list[bool] = []
        self._current_tag: Optional[str] = None
        self._current_level: Optional[int] = None
        self._current_type: Optional[BlockType] = None
        self._current_chunks: list[str] = []
        self._in_title: bool = False
        self._figcaption_pending: Optional[str] = None

    # ------------------------------------------------------------------
    # Tag open
    # ------------------------------------------------------------------
    def handle_starttag(self, tag: str, attrs: list) -> None:
        attrs_dict = dict(attrs)

        if tag == "title":
            self._in_title = True
            return

        # Always collect images regardless of context
        if tag == "img":
            src = attrs_dict.get("src", "")
            if src.startswith("http"):
                alt = sanitize_text(attrs_dict.get("alt", ""))
                if self.main_image_url is None:
                    self.main_image_url = src
                if self._skip_depth == 0 and (self._mode == _MODE_BODY or self._main_depth > 0):
                    self._flush_current()
                    self.blocks.append(_ParsedBlock(
                        BlockType.image, src, metadata={"alt": alt, "caption": None}
                    ))
                    self._figcaption_pending = src
            return

        # Skip unconditional tags
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
            return

        # Track every div/section open in a stack so handle_endtag can
        # correctly decrement _skip_depth without needing the original attrs.
        # Push BEFORE the skip-depth guard so the stack stays balanced even
        # when we're already inside a skip region.
        if tag in ("div", "section"):
            is_noise = self._skip_depth == 0 and _is_noise_div(tag, attrs_dict)
            self._div_stack.append(is_noise)
            if is_noise:
                self._skip_depth += 1
                return

        if self._skip_depth > 0:
            return

        # Track content container depth based on mode
        if _is_semantic_container(tag, attrs_dict):
            self._main_depth += 1
        elif self._mode == _MODE_DIV and _is_content_div(tag, attrs_dict):
            self._main_depth += 1

        in_content = self._mode == _MODE_BODY or self._main_depth > 0
        if not in_content:
            return

        # Open a block
        if tag in _HEADING_MAP:
            self._flush_current()
            btype, level = _HEADING_MAP[tag]
            self._start_block(tag, btype, level)
        elif tag in _PARAGRAPH_TAGS:
            self._flush_current()
            self._start_block(tag, BlockType.paragraph)
        elif tag == "blockquote":
            self._flush_current()
            self._start_block(tag, BlockType.quote)
        elif tag == "figcaption":
            self._flush_current()
            self._start_block(tag, BlockType.paragraph)

    # ------------------------------------------------------------------
    # Tag close
    # ------------------------------------------------------------------
    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
            return

        if tag in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return

        # Pop the div/section stack to close noise regions correctly.
        # _is_noise_div(tag, {}) would always return False here (no attrs),
        # so we rely on the open-time flag stored in _div_stack instead.
        if tag in ("div", "section"):
            if self._div_stack:
                was_noise = self._div_stack.pop()
                if was_noise:
                    self._skip_depth = max(0, self._skip_depth - 1)
                    return  # noise close doesn't affect _main_depth or block state

        # Container depth tracked symmetrically — we don't have attrs on close
        # so decrement whenever the tag *could* have been a container.
        if tag in ("article", "main", "div", "section") and self._main_depth > 0:
            self._main_depth -= 1

        if tag in _BLOCK_TAGS and self._current_tag == tag:
            self._flush_current()

    # ------------------------------------------------------------------
    # Text data
    # ------------------------------------------------------------------
    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
            return
        if self._skip_depth > 0:
            return
        text = data.strip()
        if not text:
            return
        if self._current_tag is not None:
            self._current_chunks.append(text)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _start_block(self, tag: str, btype: BlockType, level: Optional[int] = None) -> None:
        self._current_tag = tag
        self._current_type = btype
        self._current_level = level
        self._current_chunks = []

    def _flush_current(self) -> None:
        if not self._current_tag or not self._current_chunks:
            self._current_tag = None
            self._current_type = None
            self._current_level = None
            self._current_chunks = []
            return

        content = " ".join(self._current_chunks).strip()
        if content:
            if self._current_tag == "figcaption" and self._figcaption_pending:
                for block in reversed(self.blocks):
                    if block.block_type == BlockType.image and block.content == self._figcaption_pending:
                        block.metadata = {**(block.metadata or {}), "caption": content}
                        break
                self._figcaption_pending = None
            else:
                sanitized = sanitize_html(content)
                if sanitized:
                    self.blocks.append(_ParsedBlock(
                        self._current_type, sanitized, self._current_level
                    ))

        self._current_tag = None
        self._current_type = None
        self._current_level = None
        self._current_chunks = []


def _blocks_to_html(blocks: list[_ParsedBlock]) -> str:
    """Convert parsed content blocks to a clean semantic HTML string."""
    parts: list[str] = []
    for block in blocks:
        if block.block_type == BlockType.image:
            alt = sanitize_text((block.metadata or {}).get("alt", ""))
            safe_src = block.content.replace('"', "%22")
            safe_alt = alt.replace('"', "&quot;")
            parts.append(f'<img src="{safe_src}" alt="{safe_alt}">')
        elif block.block_type in (BlockType.heading, BlockType.subheading):
            level = min(max(block.level or 2, 2), 4)
            parts.append(f"<h{level}>{block.content}</h{level}>")
        elif block.block_type == BlockType.quote:
            parts.append(f"<blockquote>{block.content}</blockquote>")
        elif block.block_type == BlockType.paragraph:
            parts.append(f"<p>{block.content}</p>")
        elif block.block_type == BlockType.bold:
            parts.append(f"<p><strong>{block.content}</strong></p>")
    return "\n".join(parts)


def _count_paras(blocks: list[_ParsedBlock]) -> tuple[int, int]:
    """Return (paragraph_count, total_word_count) for a block list."""
    paras = [b for b in blocks if b.block_type == BlockType.paragraph]
    words = sum(len(b.content.split()) for b in paras)
    return len(paras), words


def _parse_html_blocks(html: str, url: str = "") -> dict:
    """
    Parse HTML into structured blocks using a three-strategy waterfall:

      1. "semantic"    — article/main/role=main/known CMS class strings
      2. "div_content" — additionally recognise content-hinted div/section elements
      3. "body"        — entire body (minus skip-tags and noise divs)

    Each strategy is tried in order; the first one that yields >= 3 paragraphs
    is used.  If none reach that bar the strategy with the most paragraphs wins.

    Quality gate (lowered from the original strict AND):
      ok = para_count >= MIN_PARAGRAPH_BLOCKS OR word_count >= MIN_WORD_COUNT

    Returns:
        {
          "title": str,
          "main_image_url": Optional[str],
          "blocks": list[_ParsedBlock],
          "ok": bool,
          "strategy": str   — which mode was selected (for logging)
        }
    """
    best_extractor: _BlockExtractor = _BlockExtractor(mode=_MODE_SEMANTIC)
    best_paras: int = 0
    best_words: int = 0
    best_mode: str = _MODE_SEMANTIC

    for mode in (_MODE_SEMANTIC, _MODE_DIV, _MODE_BODY):
        ext = _BlockExtractor(mode=mode)
        ext.feed(html)
        paras, words = _count_paras(ext.blocks)

        logger.debug(
            "_parse_html_blocks url=%s mode=%s blocks=%d paras=%d words=%d",
            url, mode, len(ext.blocks), paras, words,
        )

        # Always keep the first extractor as a baseline fallback
        if best_paras == 0 and best_words == 0:
            best_extractor = ext
            best_paras, best_words = paras, words
            best_mode = mode

        min_paras = settings_service.get("min_paragraph_blocks", _DEFAULT_MIN_PARAGRAPHS)
        # First strategy that has clearly enough content wins outright
        if paras >= min_paras:
            best_extractor = ext
            best_paras, best_words = paras, words
            best_mode = mode
            break

        # Otherwise keep the best seen so far
        if paras > best_paras or (paras == best_paras and words > best_words):
            best_extractor = ext
            best_paras, best_words = paras, words
            best_mode = mode

    # Quality gate: OR logic so a short-but-real article passes
    min_paras = settings_service.get("min_paragraph_blocks", _DEFAULT_MIN_PARAGRAPHS)
    min_words = settings_service.get("min_word_count", _DEFAULT_MIN_WORDS)
    ok = best_paras >= min_paras or best_words >= min_words

    title = best_extractor.title.strip() or "Untitled"
    return {
        "title": title,
        "main_image_url": best_extractor.main_image_url,
        "blocks": best_extractor.blocks,
        "ok": ok,
        "strategy": best_mode,
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
    parse into content_html, and persist new Articles.
    Updates job.status in DB.
    All exceptions are caught and stored in job.error_message — never re-raised.
    """
    db = SessionLocal()
    try:
        job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
        if not job:
            logger.error("scrape_and_save: job %d not found", job_id)
            return

        # Guard: do not scrape for inactive sites — avoids accumulating pending
        # articles that will never be published or reviewed for dead sites.
        if not job.site or not job.site.is_active:
            logger.info(
                "scrape_and_save: SKIP — site %d inactive (job id=%d)",
                job.site_id,
                job.id,
            )
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

        # [STEP 1] Search results
        logger.info(
            "Job %d: search complete — tavily=%d results, google=%d results",
            job_id, len(tavily_results), len(google_results),
        )
        for r in tavily_results:
            logger.info("  tavily url=%s score=%.3f", r["url"], r["score"])
        for r in google_results:
            logger.info("  google url=%s", r["url"])

        if not tavily_results and not google_results:
            _fail_job(
                db, job,
                "No results from Tavily or Google — check API keys in environment",
            )
            return

        candidates = _merge_results(tavily_results, google_results)

        # [STEP 2] After merge
        logger.info(
            "Job %d: %d candidates after merge+dedup (tavily=%d google=%d)",
            job_id, len(candidates), len(tavily_results), len(google_results),
        )
        for i, c in enumerate(candidates):
            logger.info("  candidate[%d] url=%s source=%s", i, c["url"], c["source"])

        new_count = 0
        skip_duplicate = 0
        skip_ssrf = 0
        skip_fetch = 0
        skip_quality = 0

        # 2. Fetch full content for each candidate
        for item in candidates:
            url = item["url"]

            # [STEP 3a] Start processing URL
            logger.info("Job %d: processing url=%s", job_id, url)

            # Skip already-saved articles
            if db.query(Article).filter(Article.source_url == url).first():
                logger.info("Job %d: SKIP duplicate — already in DB: %s", job_id, url)
                skip_duplicate += 1
                continue

            # Blocked-domain check (social platforms that block bots)
            _raw_blocked = settings_service.get("blocked_scrape_domains", "")
            _blocked_domains = {d.strip() for d in _raw_blocked.split(",") if d.strip()}
            _hostname = urlparse(url).hostname or ""
            if any(
                _hostname == d or _hostname.endswith("." + d)
                for d in _blocked_domains
            ):
                logger.info("Job %d: SKIP blocked_domain — %s", job_id, url)
                skip_ssrf += 1
                continue

            # SSRF validation
            try:
                validated_url = await validate_url(url)
            except ValueError as exc:
                logger.warning("Job %d: SKIP ssrf_block — %s: %s", job_id, url, exc)
                skip_ssrf += 1
                continue

            # Full HTML fetch
            try:
                html = await _fetch_html(validated_url)
                logger.info(
                    "Job %d: fetched %d bytes from %s", job_id, len(html), url
                )
            except Exception as exc:
                logger.warning(
                    "Job %d: SKIP fetch_error — %s: %s(%s)",
                    job_id, url, type(exc).__name__, exc,
                )
                skip_fetch += 1
                continue

            try:
                parsed = _parse_html_blocks(html, url=url)
            except Exception as exc:
                logger.warning(
                    "Job %d: SKIP parse_error — %s: %s(%s)",
                    job_id, url, type(exc).__name__, exc,
                )
                skip_fetch += 1
                continue

            # [STEP 3b] Extraction result per URL
            para_blocks = [b for b in parsed["blocks"] if b.block_type == BlockType.paragraph]
            word_count = sum(len(b.content.split()) for b in para_blocks)
            logger.info(
                "Job %d: extracted url=%s strategy=%s — total_blocks=%d para_blocks=%d words=%d ok=%s",
                job_id, url, parsed.get("strategy", "?"),
                len(parsed["blocks"]), len(para_blocks), word_count, parsed["ok"],
            )

            if not parsed["ok"]:
                logger.warning(
                    "Job %d: SKIP quality_fail — %s "
                    "(need >=%d para blocks or >=%d words, got %d blocks / %d words)",
                    job_id, url,
                    settings_service.get("min_paragraph_blocks", _DEFAULT_MIN_PARAGRAPHS),
                    settings_service.get("min_word_count", _DEFAULT_MIN_WORDS),
                    len(para_blocks), word_count,
                )
                skip_quality += 1
                continue

            title = item["title"] or parsed["title"] or "Untitled"

            # [STEP 4] About to save
            logger.info(
                "Job %d: saving article title=%r url=%s",
                job_id, title[:80], url,
            )

            content_html = _blocks_to_html(parsed["blocks"])

            article = Article(
                title=title[:500],
                source_url=url,
                status=ArticleStatus.pending,
                main_image_url=parsed["main_image_url"],
                content_html=content_html or None,
                # Tavily provides a relevance score (0–1); Google returns 0.0
                ai_score=item["score"] if item["score"] > 0 else None,
                site_id=job.site_id,
            )
            db.add(article)

            new_count += 1

            # [STEP 5] Save success
            logger.info(
                "Job %d: SAVED article id=%d title=%r source=%s score=%.3f url=%s",
                job_id, article.id, title[:80],
                item["source"], item["score"], url,
            )

        db.commit()
        job.scraped_count = (job.scraped_count or 0) + new_count
        _complete_job(db, job)

        # Final summary — shows exactly where results were dropped
        logger.info(
            "Job %d: done — saved=%d  skipped: duplicate=%d ssrf=%d fetch_error=%d quality_fail=%d",
            job_id, new_count, skip_duplicate, skip_ssrf, skip_fetch, skip_quality,
        )

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
    """Mark *job* as done, record last_run timestamp, and commit."""
    job.status = ScrapeJobStatus.done
    job.last_run = datetime.now(timezone.utc)
    db.commit()


def _fail_job(db, job: ScrapeJob, message: str) -> None:
    """Mark *job* as failed, record the error *message* (truncated to 1000 chars), and commit."""
    job.status = ScrapeJobStatus.failed
    job.last_run = datetime.now(timezone.utc)
    job.error_message = message[:1000]
    db.commit()
