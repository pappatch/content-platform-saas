"""
Scrape worker — async background scheduler.

Runs every WORKER_INTERVAL_SECONDS and executes any ScrapeJob that is due:
  - never run before (last_run is None), OR
  - last_run is older than job.frequency_minutes

Jobs are executed sequentially to respect per-domain rate limits defined in
the scraper service. All errors are stored on the job record and do not crash
the worker loop.
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
from app.services.scraper import scrape_and_save
from app.services import settings_service

logger = logging.getLogger(__name__)

_DEFAULT_INTERVAL_SECONDS: int = 60


def _due_jobs(db) -> list[ScrapeJob]:
    """Return jobs that are due for execution right now."""
    now = datetime.now(timezone.utc)
    jobs = (
        db.query(ScrapeJob)
        .filter(ScrapeJob.status != ScrapeJobStatus.running)
        .all()
    )
    due = []
    for job in jobs:
        last_run = job.last_run
        if last_run is None:
            due.append(job)
            continue
        # SQLite stores datetimes as naive strings; normalise to UTC-aware
        if last_run.tzinfo is None:
            last_run = last_run.replace(tzinfo=timezone.utc)
        elapsed_seconds = (now - last_run).total_seconds()
        if elapsed_seconds >= job.frequency_minutes * 60:
            due.append(job)
    return due


async def _run_due_jobs() -> None:
    db = SessionLocal()
    try:
        due = _due_jobs(db)
        if not due:
            return
        logger.info("Worker: %d job(s) due for execution", len(due))
        for job in due:
            logger.info("Worker: starting job id=%d keywords=%s", job.id, job.keywords)
            await scrape_and_save(job.id)
    except Exception:
        logger.exception("Worker: error while collecting due jobs")
    finally:
        db.close()


async def worker_loop() -> None:
    """
    Infinite async loop. Intended to be launched as an asyncio.Task at
    application startup and cancelled on shutdown.
    """
    logger.info("Scrape worker started (interval from platform_settings)")
    while True:
        interval = settings_service.get("scrape_worker_interval_seconds", _DEFAULT_INTERVAL_SECONDS)
        try:
            await _run_due_jobs()
        except Exception:
            logger.exception("Worker: unhandled error in _run_due_jobs")
        await asyncio.sleep(int(interval))
