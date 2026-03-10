"""
Review worker — polls for pending articles and runs AI review + SEO enrichment.

Design
------
- Wakes every WORKER_INTERVAL_SECONDS (30 s by default).
- Fetches all articles with status=pending in a single DB query.
- Processes them one at a time to stay within Anthropic rate limits.
- Each article is handled by ai_review_and_enrich(); failures leave the
  article in pending state (safe to retry on the next poll).
- The loop itself never raises; all errors are logged and suppressed so
  a single bad article cannot bring down the worker.
"""

import asyncio
import logging

from app.database import SessionLocal
from app.models.article import Article, ArticleStatus
from app.services.ai_review import ai_review_and_enrich

logger = logging.getLogger(__name__)

WORKER_INTERVAL_SECONDS: int = 30


def _pending_article_ids(db) -> list[int]:
    rows = (
        db.query(Article.id)
        .filter(Article.status == ArticleStatus.pending)
        .all()
    )
    return [row.id for row in rows]


async def _process_pending() -> None:
    db = SessionLocal()
    try:
        ids = _pending_article_ids(db)
        if not ids:
            return
        logger.info("Review worker: %d pending article(s) to process", len(ids))
        for article_id in ids:
            try:
                await ai_review_and_enrich(article_id)
            except Exception:
                logger.exception(
                    "Review worker: unhandled error for article %d", article_id
                )
    except Exception:
        logger.exception("Review worker: error while fetching pending articles")
    finally:
        db.close()


async def review_worker_loop() -> None:
    """
    Infinite async loop. Started as an asyncio.Task at app startup and
    cancelled cleanly on shutdown.
    """
    logger.info("Review worker started (interval=%ds)", WORKER_INTERVAL_SECONDS)
    while True:
        try:
            await _process_pending()
        except Exception:
            logger.exception("Review worker: unhandled error in _process_pending")
        await asyncio.sleep(WORKER_INTERVAL_SECONDS)
