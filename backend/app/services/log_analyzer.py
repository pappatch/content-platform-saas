"""
Log Analyzer service — defines alert rules and analyses the application state.

Architecture
------------
LOG_BUFFER  — a logging.Handler subclass that captures recent log records
              into a thread-safe deque (max 2000 entries).  Kept for log-based
              rules (e.g. database connection errors that can't use the DB).
              Register at startup by calling `install_log_buffer()`.

ALERT_RULES — list of rule dicts.  Each rule has a "check" field:
    "log"     — regex matched against formatted log records in LOG_BUFFER
    "db"      — calls a named DB check function
    "api_log" — checks api_usage_log table for a specific service

analyze_logs(db) — evaluates every rule, respects cooldown windows, and
                   returns a list of dicts ready to be inserted as Alert rows.
"""

import logging
import re
from collections import deque
from datetime import datetime, timedelta, timezone
from threading import Lock

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory log buffer (kept for rules that cannot use the DB when it is down)
# ---------------------------------------------------------------------------

_BUFFER_MAXLEN = 2000


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
                "level":   record.levelname,
                "name":    record.name,
                "message": self.format(record),
            }
            with self._lock:
                self._buffer.append(entry)
        except Exception:
            self.handleError(record)

    def snapshot(self) -> list[dict]:
        with self._lock:
            return list(self._buffer)

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()


# Singleton — imported and registered by alert_worker at startup
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
    # ------------------------------------------------------------------
    # DB-based rules — check application state directly
    # ------------------------------------------------------------------
    {
        "id":               "articles_stuck_pending",
        "check":            "db",
        "level":            "warning",
        "title":            "Articles stuck in pending",
        "message_template": "{count} article(s) have been in 'pending' status for over 30 minutes. The AI review worker may be stalled or overloaded. Check the review worker logs.",
        "source":           "ai_review",
        "cooldown_minutes": 30,
    },
    {
        "id":               "scrape_job_failed",
        "check":            "db",
        "level":            "warning",
        "title":            "Scrape job in failed state",
        "message_template": "{count} scrape job(s) are currently in 'failed' state. New articles may stop arriving. Check Scrape Jobs for error details and re-run or fix the job.",
        "source":           "scraper",
        "cooldown_minutes": 60,
    },
    {
        "id":               "no_articles_saved_2h",
        "check":            "db",
        "level":            "warning",
        "title":            "No new articles in 2 hours",
        "message_template": "No articles have been saved (pending or published) in the last 2 hours. The scrape worker may be stuck or all scrape jobs may be failing. Check Scrape Jobs for errors.",
        "source":           "scraper",
        "cooldown_minutes": 120,
    },
    # ------------------------------------------------------------------
    # API usage log rules — detect external service failures via DB
    # ------------------------------------------------------------------
    {
        "id":               "anthropic_errors",
        "check":            "api_log",
        "service":          "anthropic",
        "min_failures":     3,
        "window_minutes":   30,
        "level":            "critical",
        "title":            "Anthropic API errors detected",
        "message_template": "{count} Anthropic API call(s) failed in the last 30 minutes. AI review and article enrichment may be impaired. Check ANTHROPIC_API_KEY and account status.",
        "source":           "anthropic",
        "cooldown_minutes": 30,
    },
    {
        "id":               "unsplash_errors",
        "check":            "api_log",
        "service":          "unsplash",
        "min_failures":     5,
        "window_minutes":   60,
        "level":            "warning",
        "title":            "Unsplash API errors detected",
        "message_template": "{count} Unsplash API call(s) failed in the last hour. The demo key allows 50 requests/hour. Articles may be published without images until the rate limit resets.",
        "source":           "unsplash",
        "cooldown_minutes": 60,
    },
    {
        "id":               "google_cse_errors",
        "check":            "api_log",
        "service":          "google_cse",
        "min_failures":     3,
        "window_minutes":   360,
        "level":            "info",
        "title":            "Google CSE quota hit",
        "message_template": "{count} Google CSE call(s) failed in the last 6 hours. The free tier allows 100 queries/day. Scraper will fall back to Tavily only for the remainder of the day.",
        "source":           "google_cse",
        "cooldown_minutes": 360,
    },
    # ------------------------------------------------------------------
    # Log-buffer rules — for errors that cannot be detected via the DB
    # (e.g. DB itself being down; kept as last resort)
    # ------------------------------------------------------------------
    {
        "id":               "review_worker_stalled",
        "check":            "log",
        "pattern":          r"Review worker stalled:",
        "level":            "critical",
        "title":            "Review worker stalled",
        "message_template": "The review worker has not processed any article in 10+ minutes despite pending articles existing. AI review is stalled — check the Anthropic API key, account status, and backend logs.",
        "source":           "ai_review",
        "cooldown_minutes": 10,
        "min_matches":      1,
    },
    {
        "id":               "db_connection_error",
        "check":            "log",
        "pattern":          r"OperationalError|database is locked|sqlite3\.OperationalError|DB connection",
        "level":            "critical",
        "title":            "Database connection error",
        "message_template": "A database OperationalError was detected. The database may be locked or unreachable. Background workers will keep retrying but articles may not be saved until the issue is resolved.",
        "source":           "database",
        "cooldown_minutes": 30,
        "min_matches":      1,
    },
]


# ---------------------------------------------------------------------------
# Cooldown tracking
# ---------------------------------------------------------------------------

_last_alert_ts: dict[str, datetime] = {}


def _is_on_cooldown(rule_id: str, cooldown_minutes: int, db) -> bool:
    """
    Check whether a rule is on cooldown.

    Checks in-memory cache first; falls back to DB on worker restart.
    """
    now = datetime.now(timezone.utc)
    last = _last_alert_ts.get(rule_id)
    if last is not None:
        return (now - last).total_seconds() / 60 < cooldown_minutes

    # Fallback: check DB for recent alert with same title
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
            ts = existing.created_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            _last_alert_ts[rule_id] = ts
            return True
    except Exception:
        logger.debug("log_analyzer: cooldown DB check failed for rule %r", rule_id)
    return False


def _mark_alerted(rule_id: str) -> None:
    _last_alert_ts[rule_id] = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# DB check functions
# ---------------------------------------------------------------------------

def _check_articles_stuck_pending(db) -> int:
    """Return count of articles stuck in 'pending' for >30 minutes."""
    try:
        from app.models.article import Article, ArticleStatus
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        # SQLite stores naive UTC datetimes; compare without tzinfo
        cutoff_naive = cutoff.replace(tzinfo=None)
        return (
            db.query(Article)
            .filter(
                Article.status     == ArticleStatus.pending,
                Article.created_at <= cutoff_naive,
            )
            .count()
        )
    except Exception:
        logger.exception("log_analyzer: error in _check_articles_stuck_pending")
        return 0


def _check_scrape_job_failed(db) -> int:
    """Return count of scrape jobs currently in 'failed' state."""
    try:
        from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
        return db.query(ScrapeJob).filter(ScrapeJob.status == ScrapeJobStatus.failed).count()
    except Exception:
        logger.exception("log_analyzer: error in _check_scrape_job_failed")
        return 0


def _check_no_articles_2h(db) -> bool:
    """Return True if no articles were created in the last 2 hours."""
    try:
        from app.models.article import Article
        cutoff      = datetime.now(timezone.utc) - timedelta(hours=2)
        cutoff_naive = cutoff.replace(tzinfo=None)
        return (
            db.query(Article)
            .filter(Article.created_at >= cutoff_naive)
            .count() == 0
        )
    except Exception:
        logger.exception("log_analyzer: error in _check_no_articles_2h")
        return False


def _check_api_error_rate(db, service: str, window_minutes: int, min_failures: int) -> int:
    """
    Return count of API failures for a given service within the time window.
    Returns 0 if api_usage_log table does not exist yet.
    """
    try:
        from app.models.api_usage_log import ApiUsageLog
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        cutoff_naive = cutoff.replace(tzinfo=None)
        return (
            db.query(ApiUsageLog)
            .filter(
                ApiUsageLog.service  == service,
                ApiUsageLog.success  == False,   # noqa: E712
                ApiUsageLog.timestamp >= cutoff_naive,
            )
            .count()
        )
    except Exception:
        logger.debug("log_analyzer: api_log check skipped for %r (table may not exist)", service)
        return 0


# ---------------------------------------------------------------------------
# Main analysis function
# ---------------------------------------------------------------------------

def analyze_logs(db) -> list[dict]:
    """
    Evaluate all ALERT_RULES against the current DB state and log buffer.

    Returns a list of alert dicts ready to be inserted as Alert rows.
    Only creates one alert per rule per cooldown window.
    """
    log_messages = [r["message"] for r in LOG_BUFFER.snapshot()]
    alerts: list[dict] = []

    for rule in ALERT_RULES:
        rule_id          = rule["id"]
        cooldown_minutes = rule["cooldown_minutes"]
        check_type       = rule["check"]

        if _is_on_cooldown(rule_id, cooldown_minutes, db):
            continue

        triggered = False
        count     = 0

        if check_type == "db":
            if rule_id == "articles_stuck_pending":
                count     = _check_articles_stuck_pending(db)
                triggered = count >= 5
            elif rule_id == "scrape_job_failed":
                count     = _check_scrape_job_failed(db)
                triggered = count >= 1
            elif rule_id == "no_articles_saved_2h":
                triggered = _check_no_articles_2h(db)

        elif check_type == "api_log":
            count     = _check_api_error_rate(
                db,
                service        = rule["service"],
                window_minutes = rule["window_minutes"],
                min_failures   = rule["min_failures"],
            )
            triggered = count >= rule["min_failures"]

        elif check_type == "log":
            pattern = rule.get("pattern", "")
            if not pattern:
                continue
            try:
                compiled    = re.compile(pattern, re.IGNORECASE)
                match_count = sum(1 for msg in log_messages if compiled.search(msg))
                triggered   = match_count >= rule.get("min_matches", 1)
                count       = match_count
            except re.error:
                logger.error("log_analyzer: bad regex in rule %r: %r", rule_id, pattern)
                continue

        if triggered:
            message = rule["message_template"].format(count=count) \
                if "{count}" in rule["message_template"] \
                else rule["message_template"]
            alerts.append({
                "level":   rule["level"],
                "title":   rule["title"],
                "message": message,
                "source":  rule["source"],
            })
            _mark_alerted(rule_id)
            logger.info("log_analyzer: alert triggered — %s", rule["title"])

    return alerts
