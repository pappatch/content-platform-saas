"""
Alert worker — scans application logs every 5 minutes for actionable events.

On each cycle:
1. Calls log_analyzer.analyze_logs(db) which scans the in-memory LOG_BUFFER
   and performs any DB-based checks.
2. For each returned alert dict, inserts an Alert row into the database.
3. Respects per-rule cooldown windows to avoid duplicate noise.

The worker is launched as an asyncio.Task at application startup and
cancelled cleanly on shutdown.
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models.alert import Alert
from app.services.log_analyzer import analyze_logs

logger = logging.getLogger(__name__)

_WORKER_INTERVAL_SECONDS = 300   # 5 minutes — infrastructure constant


async def alert_worker_loop() -> None:
    """
    Infinite async loop. Launched at application startup.
    Cancelled on shutdown.
    """
    logger.info("Alert worker started (interval=%ds)", _WORKER_INTERVAL_SECONDS)
    # Brief startup delay so other workers have time to emit some logs first
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
