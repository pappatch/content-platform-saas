"""
Log Analyzer service — defines alert rules and analyses recent log records.

Architecture
------------
LOG_BUFFER  — a logging.Handler subclass that captures recent log records
              into a thread-safe deque (max 2000 entries, ~10 min at normal
              volume).  Register it at application startup by calling
              `install_log_buffer()`.

ALERT_RULES — list of rule dicts, each describing one detectable condition:
    {
        "id":               str,   # unique rule identifier
        "pattern":          str,   # regex matched against formatted log record
        "level":            str,   # critical / warning / info
        "title":            str,   # short alert title
        "message_template": str,   # detail message (may use {match} placeholder)
        "source":           str,   # source label shown in alert
        "cooldown_minutes": int,   # minimum gap between repeated alerts
        "min_matches":      int,   # how many pattern matches trigger one alert
        "db_check":         bool,  # True → rule uses DB instead of log buffer
    }

analyze_logs(db) — scans the buffer (or DB) for each rule, respects cooldown,
                   returns list of dicts ready to be inserted as Alert rows.
"""

import logging
import re
from collections import deque
from datetime import datetime, timedelta, timezone
from threading import Lock

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory log buffer
# ---------------------------------------------------------------------------

_BUFFER_MAXLEN = 2000   # keep last ~10 minutes at normal log volume


class _LogBuffer(logging.Handler):
    """Thread-safe ring buffer that stores recent formatted log records."""

    def __init__(self, maxlen: int = _BUFFER_MAXLEN) -> None:
        super().__init__()
        self._lock   = Lock()
        self._buffer: deque[dict] = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                "ts":      datetime.now(timezone.utc),
                "level":   record.levelname,   # DEBUG / INFO / WARNING / ERROR / CRITICAL
                "name":    record.name,         # logger name (module path)
                "message": self.format(record), # fully formatted string
            }
            with self._lock:
                self._buffer.append(entry)
        except Exception:
            self.handleError(record)

    def snapshot(self) -> list[dict]:
        """Return a copy of all buffered records."""
        with self._lock:
            return list(self._buffer)

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()


# Singleton — imported by alert_worker and registered at startup
LOG_BUFFER = _LogBuffer()


def install_log_buffer() -> None:
    """
    Attach LOG_BUFFER to the root logger so it captures all application logs.
    Call once during application startup (lifespan).
    """
    root = logging.getLogger()
    if LOG_BUFFER not in root.handlers:
        LOG_BUFFER.setFormatter(logging.Formatter("%(name)s: %(message)s"))
        root.addHandler(LOG_BUFFER)
        logger.debug("log_analyzer: LOG_BUFFER installed on root logger")


# ---------------------------------------------------------------------------
# Alert rules
# ---------------------------------------------------------------------------

ALERT_RULES: list[dict] = [
    {
        "id":               "anthropic_auth_failed",
        "pattern":          r"authentication failed.*ANTHROPIC_API_KEY|Anthropic API: authentication",
        "level":            "critical",
        "title":            "Anthropic API key invalid",
        "message_template": "The Anthropic API returned an authentication error. Check ANTHROPIC_API_KEY in .env. AI review and article enrichment are disabled until the key is fixed.",
        "source":           "anthropic",
        "cooldown_minutes": 60,
        "min_matches":      1,
        "db_check":         False,
    },
    {
        "id":               "anthropic_rate_limit",
        "pattern":          r"Anthropic API: rate limit hit",
        "level":            "warning",
        "title":            "Anthropic rate limit hit",
        "message_template": "The Anthropic API returned a rate-limit response. AI review may be delayed. Consider reducing review_worker frequency or upgrading the Anthropic plan.",
        "source":           "anthropic",
        "cooldown_minutes": 30,
        "min_matches":      1,
        "db_check":         False,
    },
    {
        "id":               "unsplash_rate_limit",
        "pattern":          r"_fetch_unsplash_candidates: HTTP 403|unsplash.*403|HTTP 403.*unsplash",
        "level":            "warning",
        "title":            "Unsplash 403 — rate limit or key issue",
        "message_template": "Unsplash returned HTTP 403. The demo key is limited to 50 requests/hour. Articles may be published without images until the rate limit resets.",
        "source":           "unsplash",
        "cooldown_minutes": 60,
        "min_matches":      1,
        "db_check":         False,
    },
    {
        "id":               "google_cse_403",
        "pattern":          r"Google CSE search failed.*403|google_cse.*403|CSE.*quota",
        "level":            "info",
        "title":            "Google CSE quota hit",
        "message_template": "Google Custom Search returned a 403 / quota error. The free tier allows 100 queries/day. Scraper will fall back to Tavily only for the remainder of the day.",
        "source":           "google_cse",
        "cooldown_minutes": 360,
        "min_matches":      1,
        "db_check":         False,
    },
    {
        "id":               "scrape_quality_fail_burst",
        "pattern":          r"quality_fail=([5-9]|[1-9]\d+)",
        "level":            "warning",
        "title":            "Scrape job: high quality failure rate",
        "message_template": "A scrape job completed with 5 or more quality failures in a single run. The target URLs may have changed layout or are behind paywalls. Review the scrape job keywords.",
        "source":           "scraper",
        "cooldown_minutes": 120,
        "min_matches":      1,
        "db_check":         False,
    },
    {
        "id":               "no_articles_saved_2h",
        "pattern":          r"",   # unused — db_check=True
        "level":            "warning",
        "title":            "No new articles in 2 hours",
        "message_template": "No articles have been saved (pending or published) in the last 2 hours. The scrape worker may be stuck or all scrape jobs may be failing. Check Scrape Jobs for errors.",
        "source":           "scraper",
        "cooldown_minutes": 120,
        "min_matches":      1,
        "db_check":         True,
    },
    {
        "id":               "db_connection_error",
        "pattern":          r"OperationalError|database is locked|sqlite3\.OperationalError|DB connection",
        "level":            "critical",
        "title":            "Database connection error",
        "message_template": "A database OperationalError was detected in the logs. The database may be locked or unreachable. Background workers will keep retrying but articles may not be saved until the issue is resolved.",
        "source":           "database",
        "cooldown_minutes": 30,
        "min_matches":      1,
        "db_check":         False,
    },
]


# ---------------------------------------------------------------------------
# Cooldown tracking (in-memory; DB is the fallback for persistence)
# ---------------------------------------------------------------------------

_last_alert_ts: dict[str, datetime] = {}


def _is_on_cooldown(rule_id: str, cooldown_minutes: int, db) -> bool:
    """
    Check whether a rule is on cooldown.

    First checks the in-memory cache; if the worker restarted (cache empty),
    falls back to the DB — looks for an Alert with matching title created
    within the cooldown window.
    """
    now = datetime.now(timezone.utc)
    last = _last_alert_ts.get(rule_id)
    if last is not None:
        elapsed = (now - last).total_seconds() / 60
        return elapsed < cooldown_minutes

    # Fallback: check DB for recent alert with same source
    try:
        from app.models.alert import Alert
        rule = next((r for r in ALERT_RULES if r["id"] == rule_id), None)
        if rule is None:
            return False
        cutoff = now - timedelta(minutes=cooldown_minutes)
        existing = (
            db.query(Alert)
            .filter(Alert.title == rule["title"], Alert.created_at >= cutoff)
            .first()
        )
        if existing:
            _last_alert_ts[rule_id] = existing.created_at.replace(tzinfo=timezone.utc) \
                if existing.created_at.tzinfo is None \
                else existing.created_at
            return True
    except Exception:
        logger.debug("log_analyzer: cooldown DB check failed for rule %r", rule_id)
    return False


def _mark_alerted(rule_id: str) -> None:
    _last_alert_ts[rule_id] = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# DB-based checks
# ---------------------------------------------------------------------------

def _check_no_articles_2h(db) -> bool:
    """Return True if no articles were created in the last 2 hours."""
    try:
        from app.models.article import Article
        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        count = (
            db.query(Article)
            .filter(Article.created_at >= cutoff)
            .count()
        )
        return count == 0
    except Exception:
        logger.exception("log_analyzer: error in _check_no_articles_2h")
        return False


# ---------------------------------------------------------------------------
# Main analysis function
# ---------------------------------------------------------------------------

def analyze_logs(db) -> list[dict]:
    """
    Scan the log buffer (and DB where needed) against all ALERT_RULES.

    Returns a list of alert dicts ready to be inserted as Alert rows.
    Only creates one alert per rule per cooldown window.
    """
    records  = LOG_BUFFER.snapshot()
    messages = [r["message"] for r in records]
    alerts   = []

    for rule in ALERT_RULES:
        rule_id          = rule["id"]
        cooldown_minutes = rule["cooldown_minutes"]

        if _is_on_cooldown(rule_id, cooldown_minutes, db):
            continue

        triggered = False

        if rule["db_check"]:
            # DB-based rule
            if rule_id == "no_articles_saved_2h":
                triggered = _check_no_articles_2h(db)
        else:
            # Log-pattern rule
            pattern = rule["pattern"]
            if not pattern:
                continue
            try:
                compiled = re.compile(pattern, re.IGNORECASE)
                match_count = sum(1 for msg in messages if compiled.search(msg))
                triggered = match_count >= rule["min_matches"]
            except re.error:
                logger.error("log_analyzer: bad regex in rule %r: %r", rule_id, pattern)
                continue

        if triggered:
            alerts.append({
                "level":   rule["level"],
                "title":   rule["title"],
                "message": rule["message_template"],
                "source":  rule["source"],
            })
            _mark_alerted(rule_id)
            logger.info("log_analyzer: alert triggered — %s", rule["title"])

    return alerts
