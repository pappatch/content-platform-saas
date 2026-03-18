"""
Alert worker — scans application state every 5 minutes for actionable events.

On each cycle:
1. Calls log_analyzer.analyze_logs(db) which queries the DB and checks the
   in-memory log buffer for detectable error conditions.
2. For each returned alert dict, inserts an Alert row into the database.
3. Respects per-rule cooldown windows to avoid duplicate noise.

The worker is launched as an asyncio.Task at application startup and
cancelled cleanly on shutdown.

InMemoryLogHandler
------------------
APP_LOG_BUFFER is a focused logging.Handler that captures WARNING and ERROR
records from all app.* loggers into a deque (last 500 entries).  Install it
at startup by calling install_app_log_handler().  This buffer is separate from
log_analyzer.LOG_BUFFER (which captures all loggers at all levels) — it is
intentionally scoped to application-level warnings and errors only.
"""

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from threading import Lock

from app.database import SessionLocal
from app.models.alert import Alert
from app.services.log_analyzer import analyze_logs

logger = logging.getLogger(__name__)

_WORKER_INTERVAL_SECONDS = 300   # 5 minutes — infrastructure constant

# ---------------------------------------------------------------------------
# In-memory application log handler (WARNING / ERROR from app.* loggers)
# ---------------------------------------------------------------------------

_APP_BUFFER_MAXLEN = 500


class InMemoryLogHandler(logging.Handler):
    """
    Captures WARNING and ERROR log records from app.* loggers into a ring
    buffer (deque maxlen=500).  Read via APP_LOG_BUFFER.snapshot().
    """

    def __init__(self, maxlen: int = _APP_BUFFER_MAXLEN) -> None:
        super().__init__(level=logging.WARNING)
        self._lock   = Lock()
        self._buffer: deque[dict] = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        # Only capture records from app.* loggers
        if not record.name.startswith("app."):
            return
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
        """Return a copy of all buffered records, newest last."""
        with self._lock:
            return list(self._buffer)

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()


# Singleton — available for import by other modules that need recent app logs
APP_LOG_BUFFER = InMemoryLogHandler()


def install_app_log_handler() -> None:
    """
    Attach APP_LOG_BUFFER to the root logger.
    Call once at application startup (lifespan).
    """
    root = logging.getLogger()
    if APP_LOG_BUFFER not in root.handlers:
        APP_LOG_BUFFER.setFormatter(logging.Formatter("%(name)s %(levelname)s: %(message)s"))
        root.addHandler(APP_LOG_BUFFER)
        logger.debug("alert_worker: APP_LOG_BUFFER installed on root logger")


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------

async def alert_worker_loop() -> None:
    """
    Infinite async loop. Launched at application startup.
    Cancelled on shutdown.
    """
    logger.info("Alert worker started (interval=%ds)", _WORKER_INTERVAL_SECONDS)
    # Brief startup delay so DB and other workers are fully initialised first
    await asyncio.sleep(30)

    while True:
        try:
            await _run_analysis()
        except Exception:
            logger.exception("Alert worker: unhandled error in _run_analysis")
        await asyncio.sleep(_WORKER_INTERVAL_SECONDS)


async def _run_analysis() -> None:
    db = SessionLocal()
    try:
        triggered = analyze_logs(db)
        if not triggered:
            return
        now = datetime.now(timezone.utc)
        for alert_data in triggered:
            alert = Alert(
                level      = alert_data["level"],
                title      = alert_data["title"],
                message    = alert_data["message"],
                source     = alert_data["source"],
                is_read    = False,
                created_at = now,
            )
            db.add(alert)
        db.commit()
        logger.info("Alert worker: created %d new alert(s)", len(triggered))
    except Exception:
        logger.exception("Alert worker: error saving alerts")
        db.rollback()
    finally:
        db.close()
