"""
Usage logging helper — writes one api_usage_log row per external API call.

Design goals
------------
- Never block the caller — best-effort telemetry only.
- Never raise — all exceptions are silently swallowed.
- Synchronous — a DB write is fast enough to call inline in async services
  without wrapping in asyncio.to_thread.

Usage
-----
    from app.services.usage_service import log_api_call

    log_api_call("anthropic", "messages_create", success=True,
                 meta={"input_tokens": 500, "output_tokens": 800, "model": "claude-haiku-4-5"})

    log_api_call("unsplash", "search_photos", success=False)
"""

import json
import logging

logger = logging.getLogger(__name__)


def log_api_call(
    service: str,
    endpoint: str,
    success: bool = True,
    meta: dict | None = None,
) -> None:
    """
    Insert one ApiUsageLog row.

    Parameters
    ----------
    service:   provider slug  (anthropic | unsplash | tavily |
                                google_cse | google_trends | stability_ai)
    endpoint:  operation name (messages_create | search_photos | search | …)
    success:   True if the call returned a usable result
    meta:      optional dict stored as JSON (tokens, credits, etc.)

    Never raises — errors are logged at DEBUG level and discarded.
    """
    try:
        from app.database import SessionLocal
        from app.models.api_usage_log import ApiUsageLog

        db = SessionLocal()
        try:
            row = ApiUsageLog(
                service=service,
                endpoint=endpoint,
                success=success,
                meta=json.dumps(meta) if meta else None,
            )
            db.add(row)
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.debug("log_api_call: DB write failed for %s/%s", service, endpoint)
