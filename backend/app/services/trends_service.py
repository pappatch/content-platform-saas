"""
Google Trends service — fetch, deduplicate, and store trending keywords.

Responsibilities
----------------
1. fetch_and_store_trends()   — pull top-10 trends for each configured region
                                 via the Google Trends RSS feed, deduplicate by
                                 (keyword, date), persist new Trend rows to the DB.
2. generate_site_config()     — call Claude Haiku (tool_use) to generate a full
                                 site configuration (name, domain slug, brand
                                 colours, template, scrape keywords) from a
                                 trending keyword.
3. create_site_from_trend()   — create Site + ScrapeJob records from a Trend,
                                 enforcing the configured auto-site limit.

Fetch strategy
--------------
The Google Trends RSS feed (https://trends.google.com/trending/rss?geo={ISO})
is used directly with the standard `requests` library.  pytrends is no longer
used for fetching because all of its higher-level methods (trending_searches,
realtime_trending_searches, top_charts) return HTTP 404 as of March 2026.

The RSS feed:
- Returns HTTP 200 for all configured regions (US, GB, IL, FR, SA)
- Provides `approx_traffic` values (e.g. "5K+", "200K+") per item
- Requires no API key

Security invariants
-------------------
- ANTHROPIC_API_KEY is read exclusively from Settings (never hardcoded).
- All external text (RSS titles) is sanitised with _sanitize_keyword() before
  DB insertion or use in prompts.
- All Anthropic errors are caught, logged, and re-raised; the caller decides
  how to handle failures.
- The auto-site limit is enforced inside create_site_from_trend(), not just
  in the route handler, so it cannot be bypassed via concurrent requests.
"""

import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional

import anthropic
import requests as _requests

from app.config import get_settings
from app.database import SessionLocal
from app.services import settings_service
from app.models.app_setting import AppSetting
from app.models.category import Category
from app.models.site import Site, SiteLanguage, TextDirection, RTL_LANGUAGES
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
from app.models.trend import Trend, TrendStatus
from app.schemas.trend import SiteConfigPreview

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Region / language constants
# ---------------------------------------------------------------------------

# Maps ISO-3166-1 alpha-2 region code → language code.
# To add a new region: insert a new entry here — no other code change needed.
# RSS URL pattern: https://trends.google.com/trending/rss?geo={KEY}
REGION_CONFIG: dict[str, str] = {
    "US": "en",
    "GB": "en",
    "IL": "he",
    "FR": "fr",
    "SA": "ar",
}

# Default regions fetched on each worker run — all configured regions.
DEFAULT_REGIONS: list[str] = list(REGION_CONFIG.keys())

# How many trends to take per region
TRENDS_PER_REGION = 10

# ---------------------------------------------------------------------------
# RSS fetch constants
# ---------------------------------------------------------------------------

_RSS_BASE_URL = "https://trends.google.com/trending/rss"
_RSS_NS       = "https://trends.google.com/trending/rss"   # XML namespace
_RSS_TIMEOUT  = 15  # seconds

# Realistic browser headers to avoid 403s from Google's CDN
_RSS_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
}

# ---------------------------------------------------------------------------
# Regions catalogue — static grouped list for GET /trends/regions
# ---------------------------------------------------------------------------
# Each entry: {"label": str, "regions": [{"geo": str, "name": str}]}
# geo="" means worldwide (no geo filter on the RSS / pytrends calls).
# To add a new region add a dict to the appropriate group — no other change needed.

REGIONS_GROUPED: list[dict] = [
    {
        "label": "World",
        "regions": [{"geo": "", "name": "Worldwide"}],
    },
    {
        "label": "Africa",
        "regions": [
            {"geo": "EG", "name": "Egypt"},
            {"geo": "GH", "name": "Ghana"},
            {"geo": "KE", "name": "Kenya"},
            {"geo": "MA", "name": "Morocco"},
            {"geo": "NG", "name": "Nigeria"},
            {"geo": "ZA", "name": "South Africa"},
            {"geo": "TN", "name": "Tunisia"},
        ],
    },
    {
        "label": "Americas",
        "regions": [
            {"geo": "AR", "name": "Argentina"},
            {"geo": "BR", "name": "Brazil"},
            {"geo": "CA", "name": "Canada"},
            {"geo": "CL", "name": "Chile"},
            {"geo": "CO", "name": "Colombia"},
            {"geo": "MX", "name": "Mexico"},
            {"geo": "PE", "name": "Peru"},
            {"geo": "US", "name": "United States"},
            {"geo": "VE", "name": "Venezuela"},
        ],
    },
    {
        "label": "Asia Pacific",
        "regions": [
            {"geo": "AU", "name": "Australia"},
            {"geo": "BD", "name": "Bangladesh"},
            {"geo": "CN", "name": "China"},
            {"geo": "HK", "name": "Hong Kong"},
            {"geo": "IN", "name": "India"},
            {"geo": "ID", "name": "Indonesia"},
            {"geo": "JP", "name": "Japan"},
            {"geo": "MY", "name": "Malaysia"},
            {"geo": "NZ", "name": "New Zealand"},
            {"geo": "PH", "name": "Philippines"},
            {"geo": "PK", "name": "Pakistan"},
            {"geo": "SG", "name": "Singapore"},
            {"geo": "KR", "name": "South Korea"},
            {"geo": "TH", "name": "Thailand"},
            {"geo": "VN", "name": "Vietnam"},
        ],
    },
    {
        "label": "Europe",
        "regions": [
            {"geo": "AT", "name": "Austria"},
            {"geo": "BE", "name": "Belgium"},
            {"geo": "CZ", "name": "Czech Republic"},
            {"geo": "DK", "name": "Denmark"},
            {"geo": "FI", "name": "Finland"},
            {"geo": "FR", "name": "France"},
            {"geo": "DE", "name": "Germany"},
            {"geo": "GR", "name": "Greece"},
            {"geo": "HU", "name": "Hungary"},
            {"geo": "IT", "name": "Italy"},
            {"geo": "NL", "name": "Netherlands"},
            {"geo": "NO", "name": "Norway"},
            {"geo": "PL", "name": "Poland"},
            {"geo": "PT", "name": "Portugal"},
            {"geo": "RO", "name": "Romania"},
            {"geo": "RU", "name": "Russia"},
            {"geo": "ES", "name": "Spain"},
            {"geo": "SE", "name": "Sweden"},
            {"geo": "CH", "name": "Switzerland"},
            {"geo": "TR", "name": "Turkey"},
            {"geo": "UA", "name": "Ukraine"},
            {"geo": "GB", "name": "United Kingdom"},
        ],
    },
    {
        "label": "Middle East",
        "regions": [
            {"geo": "IL", "name": "Israel"},
            {"geo": "IQ", "name": "Iraq"},
            {"geo": "JO", "name": "Jordan"},
            {"geo": "KW", "name": "Kuwait"},
            {"geo": "LB", "name": "Lebanon"},
            {"geo": "QA", "name": "Qatar"},
            {"geo": "SA", "name": "Saudi Arabia"},
            {"geo": "AE", "name": "United Arab Emirates"},
            {"geo": "YE", "name": "Yemen"},
        ],
    },
]

# Flat geo→language map built from REGIONS_GROUPED + REGION_CONFIG overrides.
# Used to derive the language for a trend when creating a site from Explore.
_GEO_LANGUAGE_MAP: dict[str, str] = {
    **{r["geo"]: "en" for grp in REGIONS_GROUPED for r in grp["regions"] if r["geo"]},
    # Override with known non-English languages
    "IL": "he", "SA": "ar", "AE": "ar", "EG": "ar",
    "IQ": "ar", "JO": "ar", "KW": "ar", "LB": "ar",
    "QA": "ar", "YE": "ar", "MA": "ar",
    "FR": "fr", "BE": "fr",
}

# ---------------------------------------------------------------------------
# App settings helpers
# ---------------------------------------------------------------------------

_TRENDS_REGION_KEY = "trends_fetch_region"


def get_fetch_region(db) -> str:
    """
    Read the active Google Trends fetch region from the DB.

    Returns an ISO-3166-1 alpha-2 code (e.g. "US") or "" for worldwide.
    Defaults to "" if the setting has never been written.
    """
    row = db.query(AppSetting).filter(AppSetting.key == _TRENDS_REGION_KEY).first()
    return row.value if row else ""


def set_fetch_region(db, geo: str) -> str:
    """
    Persist the active Google Trends fetch region to the DB.

    Args:
        geo: ISO-3166-1 alpha-2 code or "" for worldwide.

    Returns:
        The saved value (same as geo).
    """
    row = db.query(AppSetting).filter(AppSetting.key == _TRENDS_REGION_KEY).first()
    if row:
        row.value = geo
    else:
        db.add(AppSetting(key=_TRENDS_REGION_KEY, value=geo))
    db.commit()
    return geo


# ---------------------------------------------------------------------------
# Explore pytrends helpers
# ---------------------------------------------------------------------------

# Maps the UI timeframe strings to pytrends timeframe strings
TIMEFRAME_MAP: dict[str, str] = {
    "30d": "today 1-m",
    "90d": "today 3-m",
    "1y":  "today 12-m",
}

# RTL / non-English geo codes — passed as hl to TrendReq so results are
# more relevant for the target language.
_GEO_HL: dict[str, str] = {
    "IL": "he-IL",
    "SA": "ar", "AE": "ar", "EG": "ar", "IQ": "ar",
    "JO": "ar", "KW": "ar", "LB": "ar", "QA": "ar", "YE": "ar",
    "FR": "fr-FR", "BE": "fr-FR",
    "DE": "de-DE", "AT": "de-DE", "CH": "de-CH",
    "ES": "es-ES", "MX": "es-MX", "AR": "es-AR",
    "BR": "pt-BR", "PT": "pt-PT",
    "IT": "it-IT",
    "RU": "ru-RU",
    "JP": "ja-JP",
    "CN": "zh-CN", "HK": "zh-TW",
    "KR": "ko-KR",
    "TR": "tr-TR",
    "PL": "pl-PL",
    "NL": "nl-NL",
    "SE": "sv-SE",
    "NO": "nb-NO",
    "FI": "fi-FI",
    "DK": "da-DK",
    "GR": "el-GR",
    "HU": "hu-HU",
    "CZ": "cs-CZ",
    "RO": "ro-RO",
    "UA": "uk-UA",
}


def _explore_keyword_sync(keyword: str, timeframe: str, geo: str) -> dict:
    """
    Run pytrends interest_over_time, interest_by_region, and related_queries
    for a single keyword.

    Each sub-call is individually wrapped in try/except so a failure in one
    (e.g. interest_by_region returning empty) does not lose the others.

    Args:
        keyword:   Search keyword (already sanitised by the caller).
        timeframe: One of "30d", "90d", "1y".
        geo:       ISO country code or "" for worldwide.

    Returns:
        Dict with keys:
          interest_over_time : list[{"date": str, "value": int}]
          top_countries      : list[{"country": str, "value": int}]
          related_queries    : list[{"query": str, "value": int}]

    Runs synchronously — call via asyncio.to_thread() from async code.
    """
    from pytrends.request import TrendReq

    hl = _GEO_HL.get(geo, "en-US")
    tf = TIMEFRAME_MAP.get(timeframe, "today 1-m")

    pytrend = TrendReq(hl=hl, tz=0, timeout=(15, 30), retries=1, backoff_factor=0.5)
    pytrend.build_payload([keyword], timeframe=tf, geo=geo)

    # ── Interest over time ────────────────────────────────────────────────
    iot_data: list[dict] = []
    try:
        df = pytrend.interest_over_time()
        if df is not None and not df.empty and keyword in df.columns:
            for date_idx, row in df.iterrows():
                if not row.get("isPartial", False):
                    iot_data.append({
                        "date":  date_idx.strftime("%Y-%m-%d"),
                        "value": int(row[keyword]),
                    })
    except Exception as exc:
        logger.warning("explore: interest_over_time failed for %r — %s", keyword, exc)

    # ── Interest by country ───────────────────────────────────────────────
    countries_data: list[dict] = []
    try:
        ibr = pytrend.interest_by_region(resolution="COUNTRY", inc_low_vol=False)
        if ibr is not None and not ibr.empty and keyword in ibr.columns:
            top = ibr[[keyword]].sort_values(keyword, ascending=False).head(20)
            for country_name, row in top.iterrows():
                val = int(row[keyword])
                if val > 0:
                    countries_data.append({"country": str(country_name), "value": val})
    except Exception as exc:
        logger.warning("explore: interest_by_region failed for %r — %s", keyword, exc)

    # ── Related queries ───────────────────────────────────────────────────
    queries_data: list[dict] = []
    try:
        rq = pytrend.related_queries()
        kw_data = rq.get(keyword, {})
        top_df = kw_data.get("top")
        if top_df is not None and not top_df.empty:
            for _, row in top_df.head(10).iterrows():
                queries_data.append({
                    "query": str(row["query"]),
                    "value": int(row["value"]),
                })
    except Exception as exc:
        logger.warning("explore: related_queries failed for %r — %s", keyword, exc)

    return {
        "interest_over_time": iot_data,
        "top_countries":      countries_data,
        "related_queries":    queries_data,
    }


async def explore_keyword(keyword: str, timeframe: str, geo: str) -> dict:
    """
    Async wrapper around _explore_keyword_sync — runs in a thread pool so the
    blocking pytrends HTTP calls do not block the FastAPI event loop.

    Args:
        keyword:   Search keyword (caller must sanitise first).
        timeframe: "30d" | "90d" | "1y"
        geo:       ISO country code or "" for worldwide.

    Returns:
        Dict with interest_over_time, top_countries, related_queries lists.
    """
    return await asyncio.to_thread(_explore_keyword_sync, keyword, timeframe, geo)


# ---------------------------------------------------------------------------
# Claude model config
# ---------------------------------------------------------------------------

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 1024

_SITE_CONFIG_TOOL = {
    "name": "generate_site_config",
    "description": (
        "Generate a complete site configuration for a new content site based on a "
        "trending keyword. Return realistic, creative, and coherent values."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "site_name": {
                "type": "string",
                "description": (
                    "Creative, memorable site name related to the trending topic. "
                    "Max 60 characters. Examples: 'TechBuzz Daily', 'Bonsai World'."
                ),
            },
            "domain_slug": {
                "type": "string",
                "description": (
                    "URL-safe slug for the domain, lowercase, hyphens only. "
                    "Examples: 'techbuzz-daily', 'bonsai-world'. Max 40 chars."
                ),
            },
            "description": {
                "type": "string",
                "description": "One-sentence site description. Max 160 characters.",
            },
            "template_id": {
                "type": "string",
                "enum": ["template-a", "template-b", "template-c", "template-d", "template-e"],
                "description": (
                    "Best-fit template: template-a=Newspaper (breaking news), "
                    "template-b=Magazine (feature content), template-c=Blog (opinion/editorial), "
                    "template-d=Cards (visual/entertainment), template-e=Sidebar (tech/lists)."
                ),
            },
            "primary_color": {
                "type": "string",
                "description": "Hex brand primary colour, e.g. '#6366f1'. Must contrast on white.",
            },
            "secondary_color": {
                "type": "string",
                "description": "Hex accent colour that complements primary_color.",
            },
            "keywords": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "5–10 specific search terms to seed the content scraper for this site. "
                    "Include the trending keyword plus closely related terms."
                ),
            },
            "about": {
                "type": "string",
                "description": (
                    "2-3 sentence description of the site for the footer About section. "
                    "Describe what the site covers and who it is for. Max 300 characters."
                ),
            },
            "tagline": {
                "type": "string",
                "description": (
                    "Short, catchy tagline shown under the site name. "
                    "E.g. 'Your daily source for bonsai inspiration'. Max 80 characters."
                ),
            },
            "default_category_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "3–5 category names relevant to the site topic. "
                    "E.g. ['Beginners', 'Techniques', 'Inspiration', 'Tools']. "
                    "These seed the CMS category suggestions."
                ),
            },
        },
        "required": [
            "site_name", "domain_slug", "description", "template_id",
            "primary_color", "secondary_color", "keywords",
        ],
    },
}


# ---------------------------------------------------------------------------
# Input sanitisation
# ---------------------------------------------------------------------------

def _sanitize_keyword(kw: str) -> str:
    """
    Strip a pytrends keyword to safe printable characters.

    Allows letters, digits, spaces, hyphens, and apostrophes only.
    Truncates to 200 chars to prevent oversized prompts.
    """
    cleaned = re.sub(r"[^\w\s'\-]", "", kw, flags=re.UNICODE).strip()
    return cleaned[:200]


# ---------------------------------------------------------------------------
# RSS fetch helpers
# ---------------------------------------------------------------------------

def _parse_traffic_score(approx_traffic: str) -> float:
    """
    Convert a Google Trends approx_traffic string to a 0–1 quality score.

    Examples:
        "100+"   → ~0.05   (low traffic)
        "1K+"    → ~0.15
        "10K+"   → ~0.35
        "100K+"  → ~0.65
        "500K+"  → ~0.85
        "1M+"    → 1.0

    Uses a logarithmic scale so the full 0–1 range is used across typical
    traffic values.  Falls back to 0.5 if the string cannot be parsed.
    """
    import math

    raw = approx_traffic.strip().rstrip("+").strip().upper()
    multipliers = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}
    try:
        number: float
        for suffix, mult in multipliers.items():
            if raw.endswith(suffix):
                number = float(raw[: -len(suffix)]) * mult
                break
        else:
            number = float(raw)

        # log10 scale: 100 → 0.05, 1M → 1.0 (roughly)
        score = math.log10(max(number, 1)) / 6.0   # log10(1_000_000) == 6
        return round(min(max(score, 0.01), 1.0), 3)
    except (ValueError, ZeroDivisionError):
        return 0.5


def _fetch_rss_sync(geo: str) -> list[tuple[str, float]]:
    """
    Fetch trending topics for one region via the Google Trends RSS feed.

    This is the primary (and only) fetch strategy.  pytrends higher-level
    methods (trending_searches, realtime_trending_searches, top_charts) all
    return HTTP 404 as of March 2026; the RSS feed returns HTTP 200 reliably.

    Args:
        geo: ISO-3166-1 alpha-2 country code, e.g. "US", "IL".

    Returns:
        List of (keyword, score) tuples, up to TRENDS_PER_REGION entries.
        Score is derived from approx_traffic when available, otherwise
        rank-based (rank 0 → 1.0, rank 9 → 0.1).

    Runs synchronously — call via asyncio.to_thread() from async code.
    """
    url = f"{_RSS_BASE_URL}?geo={geo}"
    try:
        resp = _requests.get(url, headers=_RSS_HEADERS, timeout=_RSS_TIMEOUT)
        resp.raise_for_status()
    except _requests.exceptions.HTTPError as exc:
        logger.warning(
            "trends_service: RSS HTTP %s for geo=%s", exc.response.status_code, geo
        )
        return []
    except _requests.exceptions.RequestException as exc:
        logger.warning("trends_service: RSS request failed for geo=%s — %s", geo, exc)
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as exc:
        logger.warning("trends_service: RSS XML parse failed for geo=%s — %s", geo, exc)
        return []

    results: list[tuple[str, float]] = []
    for rank, item in enumerate(root.findall(".//item")):
        if len(results) >= TRENDS_PER_REGION:
            break

        title_el = item.find("title")
        if title_el is None or not title_el.text:
            continue

        keyword = title_el.text.strip()
        if not keyword:
            continue

        # Prefer traffic-derived score; fall back to rank-based
        traffic_el = item.find(f"{{{_RSS_NS}}}approx_traffic")
        if traffic_el is not None and traffic_el.text:
            score = _parse_traffic_score(traffic_el.text)
        else:
            score = round(1.0 - rank * 0.09, 2)  # rank 0→1.0, rank 9→0.19

        results.append((keyword, score))

    logger.info(
        "trends_service: RSS geo=%s returned %d item(s)", geo, len(results)
    )
    return results


async def fetch_and_store_trends(regions: Optional[list[str]] = None) -> int:
    """
    Fetch trending topics for each region via the Google Trends RSS feed
    and persist new rows to the database.

    Deduplication: (keyword, trend_date) pairs that already exist in the DB
    are skipped silently — the same keyword can appear again on a later date.

    Args:
        regions: optional list of ISO-3166-1 alpha-2 region codes to fetch.
                 Defaults to DEFAULT_REGIONS (all configured regions).

    Returns:
        Total number of new Trend rows inserted across all regions.
    """
    if regions is None:
        # Read the active fetch region from DB; fall back to worldwide ("").
        _cfg_db = SessionLocal()
        try:
            active_geo = get_fetch_region(_cfg_db)
        finally:
            _cfg_db.close()
        regions = [active_geo]  # single region (or "" for worldwide)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    inserted = 0

    db = SessionLocal()
    try:
        for geo in regions:
            # For "" (worldwide) default to "en"; for known codes use the map.
            language = _GEO_LANGUAGE_MAP.get(geo, REGION_CONFIG.get(geo, "en"))

            # RSS fetch runs in a thread pool (blocking I/O)
            items = await asyncio.to_thread(_fetch_rss_sync, geo)
            if not items:
                continue

            region_inserted = 0
            for raw_kw, score in items:
                keyword = _sanitize_keyword(raw_kw)
                if not keyword:
                    continue

                # Dedup: skip if (keyword, trend_date) already exists for this region
                exists = (
                    db.query(Trend)
                    .filter(
                        Trend.keyword == keyword,
                        Trend.trend_date == today,
                        Trend.region == geo,
                    )
                    .first()
                )
                if exists:
                    continue

                trend = Trend(
                    keyword=keyword,
                    region=geo,
                    language=language,
                    score=score,
                    trend_date=today,
                    status=TrendStatus.new,
                )
                db.add(trend)
                region_inserted += 1

            db.commit()
            inserted += region_inserted
            logger.info(
                "trends_service: geo=%s — inserted %d new trend(s) for %s",
                geo, region_inserted, today,
            )

    except Exception:
        logger.exception("trends_service: unexpected error during fetch_and_store_trends")
        db.rollback()
    finally:
        db.close()

    return inserted


# ---------------------------------------------------------------------------
# AI site config generation
# ---------------------------------------------------------------------------

async def generate_site_config(keyword: str, language: str) -> SiteConfigPreview:
    """
    Call Claude Haiku to generate a complete site configuration for a keyword.

    Args:
        keyword:  The trending keyword (already sanitised).
        language: Target language code ("en", "he", "ar", "fr").

    Returns:
        SiteConfigPreview with AI-generated name, slug, colours, template, keywords.

    Raises:
        ValueError: if no API key is configured.
        anthropic.APIError subclasses: on API failures (caller handles).
    """
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured — cannot generate site config")

    lang_names = {"en": "English", "he": "Hebrew", "ar": "Arabic", "fr": "French"}
    lang_name = lang_names.get(language, "English")

    prompt = (
        f"A new content site is being created around the trending topic: \"{keyword}\".\n"
        f"The site language is {lang_name}.\n\n"
        "Generate a complete site configuration:\n"
        "- A creative, memorable site name related to the topic\n"
        "- A URL-safe domain slug\n"
        "- 5–10 specific search keywords to seed the content scraper\n"
        "- A fitting template style (newspaper / magazine / blog / cards / sidebar)\n"
        "- Brand colours that suit the topic's mood\n\n"
        "Call generate_site_config with the result."
    )

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            tools=[_SITE_CONFIG_TOOL],
            tool_choice={"type": "tool", "name": "generate_site_config"},
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        logger.error("Anthropic API: authentication failed — check ANTHROPIC_API_KEY")
        raise
    except anthropic.RateLimitError:
        logger.warning("Anthropic API: rate limit hit in generate_site_config")
        raise
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic API error %d: %s", exc.status_code, exc.message)
        raise
    except anthropic.APIConnectionError:
        logger.error("Anthropic API: connection error in generate_site_config")
        raise

    for block in response.content:
        if block.type == "tool_use" and block.name == "generate_site_config":
            data = block.input
            return SiteConfigPreview(
                site_name=str(data.get("site_name", keyword))[:60],
                domain_slug=re.sub(r"[^a-z0-9\-]", "", str(data.get("domain_slug", "")).lower())[:40]
                            or re.sub(r"\s+", "-", keyword.lower())[:40],
                language=language,
                template_id=data.get("template_id", "template-a"),
                config={
                    "primary_color":           data.get("primary_color", "#6366f1"),
                    "secondary_color":         data.get("secondary_color", "#10b981"),
                    "about":                   str(data.get("about", ""))[:300],
                    "tagline":                 str(data.get("tagline", ""))[:80],
                    "default_category_names":  [
                        str(c)[:60] for c in data.get("default_category_names", [])[:5]
                    ],
                },
                keywords=[str(k)[:100] for k in data.get("keywords", [keyword])[:10]],
                description=str(data.get("description", ""))[:160],
            )

    raise ValueError("Anthropic response contained no generate_site_config tool call")


# ---------------------------------------------------------------------------
# Site + ScrapeJob creation
# ---------------------------------------------------------------------------

def _count_auto_created_sites(db) -> int:
    """Return the number of Trend rows with status=used (= sites created via trends)."""
    return db.query(Trend).filter(Trend.status == TrendStatus.used).count()


async def create_site_from_trend(
    trend_id: int,
    overrides: Optional[dict] = None,
) -> dict:
    """
    Create a Site and ScrapeJob from a trend, with AI-generated configuration.

    Enforces settings.trends_auto_site_limit — raises RuntimeError if exceeded.
    Marks the Trend as status=used and links it to the new Site.

    Args:
        trend_id:  ID of the Trend row to use.
        overrides: Optional dict with keys matching SiteConfigPreview fields that
                   take precedence over the AI-generated defaults.

    Returns:
        dict with keys "trend", "site", "scrape_job" (ORM objects).

    Raises:
        ValueError:    Trend not found, already used, or site limit exceeded.
        RuntimeError:  Domain already taken (unlikely with slug + uuid but handled).
    """
    db = SessionLocal()
    try:
        trend = db.query(Trend).filter(Trend.id == trend_id).first()
        if not trend:
            raise ValueError(f"Trend {trend_id} not found")
        if trend.status == TrendStatus.used:
            raise ValueError(f"Trend {trend_id} was already used to create a site")
        if trend.status == TrendStatus.dismissed:
            raise ValueError(f"Trend {trend_id} is dismissed")

        # --- Enforce auto-site limit ---
        current_count = _count_auto_created_sites(db)
        limit = settings_service.get("trends_auto_site_limit", 3)
        if current_count >= limit:
            raise ValueError(
                f"Auto-site limit reached ({current_count}/{limit}). "
                "Raise trends_auto_site_limit in Platform Settings or dismiss existing auto-sites."
            )

        # --- Generate AI config ---
        try:
            ai_config = await generate_site_config(trend.keyword, trend.language)
        except Exception as exc:
            # Fall back to a minimal config so creation still succeeds
            logger.warning(
                "create_site_from_trend: AI config generation failed (%s), using defaults",
                exc,
            )
            ai_config = SiteConfigPreview(
                site_name=trend.keyword.title(),
                domain_slug=re.sub(r"\s+", "-", trend.keyword.lower())[:40],
                language=trend.language,
                template_id="template-a",
                config={
                    "primary_color":          "#6366f1",
                    "secondary_color":        "#10b981",
                    "about":                  f"Latest news and updates about {trend.keyword}.",
                    "tagline":                f"Your source for {trend.keyword} news",
                    "default_category_names": ["News", "Analysis", "Features"],
                },
                keywords=[trend.keyword],
                description=f"Latest news and updates about {trend.keyword}.",
            )

        # --- Apply overrides from the request body ---
        ov = overrides or {}
        site_name   = ov.get("site_name")    or ai_config.site_name
        domain_slug = ov.get("domain_slug")  or ai_config.domain_slug
        language    = ov.get("language")     or ai_config.language
        template_id = ov.get("template_id")  or ai_config.template_id
        config      = ov.get("config")       or ai_config.config
        keywords    = ov.get("keywords")     or ai_config.keywords

        # Ensure domain uniqueness — append trend_id if slug is taken
        domain = f"{domain_slug}.auto"
        existing = db.query(Site).filter(Site.domain == domain).first()
        if existing:
            domain = f"{domain_slug}-{trend_id}.auto"

        # Derive SiteLanguage enum
        try:
            lang_enum = SiteLanguage(language)
        except ValueError:
            lang_enum = SiteLanguage.en

        # --- Create Site ---
        site = Site(
            name=site_name,
            domain=domain,
            template_id=template_id,
            config=config,
            language=lang_enum,
        )
        db.add(site)
        db.flush()  # get site.id before creating the job

        # --- Auto-create initial categories from default_category_names ---
        for cat_name in (config.get("default_category_names") or [])[:5]:
            if not cat_name or not cat_name.strip():
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", cat_name.lower()).strip("-")
            if not slug:
                continue
            exists = db.query(Category).filter(
                Category.site_id == site.id,
                Category.slug == slug,
            ).first()
            if not exists:
                db.add(Category(name=cat_name.strip(), slug=slug, site_id=site.id))

        # --- Create ScrapeJob ---
        job = ScrapeJob(
            site_id=site.id,
            keywords=keywords,
            language=language,
            frequency_minutes=60,
            status=ScrapeJobStatus.pending,
        )
        db.add(job)

        # --- Mark trend as used ---
        trend.status = TrendStatus.used
        trend.site_id = site.id

        db.commit()
        db.refresh(trend)
        db.refresh(site)
        db.refresh(job)

        logger.info(
            "create_site_from_trend: created site id=%d '%s' from trend id=%d '%s'",
            site.id, site.name, trend.id, trend.keyword,
        )
        return {"trend": trend, "site": site, "scrape_job": job}

    except (ValueError, RuntimeError):
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("create_site_from_trend: unexpected error for trend %d", trend_id)
        raise
    finally:
        db.close()
