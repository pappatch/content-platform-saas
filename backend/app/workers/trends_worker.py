"""
Trends worker — periodic Google Trends fetch.

Runs every WORKER_INTERVAL_SECONDS (default 5 hours = 18 000 s) and calls
fetch_and_store_trends() to pull the latest trending keywords for all
configured regions via the Google Trends RSS feed.

Design decisions
----------------
- 5-hour interval avoids hammering Google's API while still capturing daily
  trend shifts (typically 4–6 meaningful updates per day).
- The first run is intentionally delayed by INITIAL_DELAY_SECONDS so the
  server has time to fully start up before making external HTTP calls.
- All errors are caught and logged; a single failed fetch does not crash the
  worker or the application.
"""

import asyncio
import logging

from app.services.trends_service import fetch_and_store_trends
from app.services import settings_service

logger = logging.getLogger(__name__)

INITIAL_DELAY_SECONDS: int = 30   # brief pause so DB / settings are ready before first run
_DEFAULT_INTERVAL_HOURS: int = 5  # fallback if platform_settings DB is unreachable


async def trends_worker_loop() -> None:
    """
    Infinite async loop.  Intended to be launched as an asyncio.Task at
    application startup and cancelled on shutdown.

    On each tick:
    1. Read trends_fetch_interval_hours from platform settings (live value).
    2. Call fetch_and_store_trends() for the configured region.
    3. Log how many new trends were inserted.
    4. Sleep for the configured interval before the next tick.

    Reading the interval on every iteration means an admin can change it in
    the Settings panel and the next sleep will honour the new value without
    a server restart.
    """
    logger.info(
        "Trends worker started (initial delay=%ds, interval from platform_settings)",
        INITIAL_DELAY_SECONDS,
    )
    # Brief startup delay so the DB and settings cache are ready
    await asyncio.sleep(INITIAL_DELAY_SECONDS)

    while True:
        interval_hours = settings_service.get(
            "trends_fetch_interval_hours", _DEFAULT_INTERVAL_HOURS
        )
        interval_seconds = int(interval_hours) * 3600

        try:
            inserted = await fetch_and_store_trends()
            logger.info("Trends worker: inserted %d new trend(s)", inserted)
        except asyncio.CancelledError:
            # Propagate cancellation cleanly on shutdown
            raise
        except Exception:
            logger.exception("Trends worker: unhandled error in fetch_and_store_trends")

        logger.debug("Trends worker: sleeping %dh (%ds)", interval_hours, interval_seconds)
        await asyncio.sleep(interval_seconds)
