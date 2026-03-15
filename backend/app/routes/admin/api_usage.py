"""
API Usage & Costs dashboard route.

GET /admin/api-usage  (admin only)

Returns per-service stats aggregated from:
  - api_usage_log DB table  — call counts, token totals (all services)
  - Stability AI balance API — live credit balance when key is configured
  - Anthropic / Tavily      — future: external usage APIs; currently DB-only

Cost models (USD)
-----------------
  Anthropic Haiku  : $0.25 / 1M input tokens, $1.25 / 1M output tokens
  Stability AI     : $0.04 / image at 1536×640 (≈ 1 credit per image)
  Tavily           : $0.004 / search call (estimated — no published price)
  Google CSE       : free tier 100 req/day; $5 / 1000 thereafter
  Unsplash         : free demo key, 50 req/hour rate limit
  Google Trends    : free, no API key required
"""

import asyncio
import calendar
import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.api_usage_log import ApiUsageLog
from app.security.permissions import require_admin

logger   = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# Cost / quota constants
# ---------------------------------------------------------------------------

_ANTHROPIC_INPUT_COST_PER_M  = 0.25    # $ / 1M input tokens  (Haiku 4.5)
_ANTHROPIC_OUTPUT_COST_PER_M = 1.25    # $ / 1M output tokens (Haiku 4.5)
_STABILITY_COST_PER_IMAGE    = 0.04    # $ / 1536×640 SDXL image  (≈ 1 credit)
_TAVILY_COST_PER_SEARCH      = 0.004   # $ / search (estimated)
_GOOGLE_CSE_FREE_DAILY       = 100     # free-tier daily query cap
_UNSPLASH_RATE_LIMIT_HOURLY  = 50      # demo key hourly cap


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def _start_of_day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_month(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _projected_eom(cost_month: float, now: datetime) -> float:
    """Extrapolate month-to-date cost to end-of-month via daily average."""
    days_elapsed  = max(now.day, 1)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    return round(cost_month / days_elapsed * days_in_month, 4)


def _db_counts(db: Session, service: str, now: datetime) -> tuple[int, int]:
    """Return (calls_today, calls_month) for *service* from api_usage_log."""
    calls_today = (
        db.query(func.count(ApiUsageLog.id))
        .filter(
            ApiUsageLog.service   == service,
            ApiUsageLog.timestamp >= _start_of_day(now),
        )
        .scalar() or 0
    )
    calls_month = (
        db.query(func.count(ApiUsageLog.id))
        .filter(
            ApiUsageLog.service   == service,
            ApiUsageLog.timestamp >= _start_of_month(now),
        )
        .scalar() or 0
    )
    return calls_today, calls_month


def _sparkline(db: Session, service: str, now: datetime) -> list[dict]:
    """Return call counts for the last 7 calendar days (oldest → newest)."""
    start = (now - timedelta(days=6)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    rows = (
        db.query(
            func.date(ApiUsageLog.timestamp).label("day"),
            func.count().label("cnt"),
        )
        .filter(
            ApiUsageLog.service   == service,
            ApiUsageLog.timestamp >= start,
        )
        .group_by(func.date(ApiUsageLog.timestamp))
        .all()
    )
    counts = {str(r.day): r.cnt for r in rows}
    result = []
    for offset in range(7):
        day = (now - timedelta(days=6 - offset)).date()
        result.append({"date": str(day), "calls": counts.get(str(day), 0)})
    return result


# ---------------------------------------------------------------------------
# Per-service aggregators
# ---------------------------------------------------------------------------

async def _anthropic_stats(db: Session, now: datetime) -> dict:
    month_start = _start_of_month(now)
    calls_today, calls_month = _db_counts(db, "anthropic", now)

    # Sum tokens stored in meta JSON for this month
    rows = (
        db.query(ApiUsageLog.meta)
        .filter(
            ApiUsageLog.service   == "anthropic",
            ApiUsageLog.timestamp >= month_start,
            ApiUsageLog.success   == True,  # noqa: E712
        )
        .all()
    )
    input_tokens = output_tokens = 0
    for (meta_str,) in rows:
        if meta_str:
            try:
                m = json.loads(meta_str)
                input_tokens  += m.get("input_tokens",  0)
                output_tokens += m.get("output_tokens", 0)
            except Exception:
                pass

    cost_month = round(
        input_tokens  / 1_000_000 * _ANTHROPIC_INPUT_COST_PER_M
        + output_tokens / 1_000_000 * _ANTHROPIC_OUTPUT_COST_PER_M,
        4,
    )
    configured = bool(settings.anthropic_api_key)
    return {
        "id":                   "anthropic",
        "name":                 "Anthropic (Claude Haiku)",
        "configured":           configured,
        "status":               "ok" if configured else "error",
        "calls_today":          calls_today,
        "calls_month":          calls_month,
        "cost_month":           cost_month,
        "cost_projected_eom":   _projected_eom(cost_month, now),
        "credits_remaining":    None,
        "input_tokens_month":   input_tokens,
        "output_tokens_month":  output_tokens,
        "sparkline":            _sparkline(db, "anthropic", now),
    }


async def _stability_stats(db: Session, now: datetime) -> dict:
    calls_today, calls_month = _db_counts(db, "stability_ai", now)
    cost_month  = round(calls_month * _STABILITY_COST_PER_IMAGE, 4)
    configured  = bool(settings.stability_api_key)

    credits_remaining = None
    if configured:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    "https://api.stability.ai/v1/user/balance",
                    headers={"Authorization": f"Bearer {settings.stability_api_key}"},
                )
                resp.raise_for_status()
                credits_remaining = float(resp.json().get("credits", 0))
        except Exception as exc:
            logger.debug("stability balance API unavailable: %s", exc)

    status = "ok" if configured else "warning"
    if credits_remaining is not None and credits_remaining < 5:
        status = "warning"

    return {
        "id":                   "stability_ai",
        "name":                 "Stability AI (SDXL)",
        "configured":           configured,
        "status":               status,
        "calls_today":          calls_today,
        "calls_month":          calls_month,
        "cost_month":           cost_month,
        "cost_projected_eom":   _projected_eom(cost_month, now),
        "credits_remaining":    credits_remaining,
        "input_tokens_month":   None,
        "output_tokens_month":  None,
        "sparkline":            _sparkline(db, "stability_ai", now),
    }


async def _unsplash_stats(db: Session, now: datetime) -> dict:
    calls_today, calls_month = _db_counts(db, "unsplash", now)
    one_hour_ago = now - timedelta(hours=1)
    calls_last_hour = (
        db.query(func.count(ApiUsageLog.id))
        .filter(
            ApiUsageLog.service   == "unsplash",
            ApiUsageLog.timestamp >= one_hour_ago,
        )
        .scalar() or 0
    )

    pct = calls_last_hour / _UNSPLASH_RATE_LIMIT_HOURLY if _UNSPLASH_RATE_LIMIT_HOURLY else 0
    if not settings.unsplash_access_key:
        status = "error"
    elif pct >= 1.0:
        status = "error"
    elif pct >= 0.8:
        status = "warning"
    else:
        status = "ok"

    return {
        "id":                   "unsplash",
        "name":                 "Unsplash",
        "configured":           bool(settings.unsplash_access_key),
        "status":               status,
        "calls_today":          calls_today,
        "calls_month":          calls_month,
        "calls_last_hour":      calls_last_hour,
        "rate_limit_hourly":    _UNSPLASH_RATE_LIMIT_HOURLY,
        "cost_month":           0.0,
        "cost_projected_eom":   0.0,
        "credits_remaining":    None,
        "input_tokens_month":   None,
        "output_tokens_month":  None,
        "sparkline":            _sparkline(db, "unsplash", now),
    }


async def _tavily_stats(db: Session, now: datetime) -> dict:
    calls_today, calls_month = _db_counts(db, "tavily", now)
    cost_month  = round(calls_month * _TAVILY_COST_PER_SEARCH, 4)
    configured  = bool(settings.tavily_api_key)
    return {
        "id":                   "tavily",
        "name":                 "Tavily Search",
        "configured":           configured,
        "status":               "ok" if configured else "error",
        "calls_today":          calls_today,
        "calls_month":          calls_month,
        "cost_month":           cost_month,
        "cost_projected_eom":   _projected_eom(cost_month, now),
        "credits_remaining":    None,
        "input_tokens_month":   None,
        "output_tokens_month":  None,
        "sparkline":            _sparkline(db, "tavily", now),
    }


async def _google_cse_stats(db: Session, now: datetime) -> dict:
    calls_today, calls_month = _db_counts(db, "google_cse", now)
    configured  = bool(settings.google_api_key and settings.google_cse_id)

    # Cost: first _GOOGLE_CSE_FREE_DAILY calls/day are free; $5 / 1000 after
    billable_month = max(0, calls_month - _GOOGLE_CSE_FREE_DAILY * now.day)
    cost_month     = round(billable_month / 1000 * 5.0, 4)

    pct_daily = calls_today / _GOOGLE_CSE_FREE_DAILY if _GOOGLE_CSE_FREE_DAILY else 0
    if not configured:
        status = "error"
    elif pct_daily >= 1.0:
        status = "error"
    elif pct_daily >= 0.8:
        status = "warning"
    else:
        status = "ok"

    return {
        "id":                   "google_cse",
        "name":                 "Google Custom Search",
        "configured":           configured,
        "status":               status,
        "calls_today":          calls_today,
        "calls_month":          calls_month,
        "daily_quota":          _GOOGLE_CSE_FREE_DAILY,
        "cost_month":           cost_month,
        "cost_projected_eom":   _projected_eom(cost_month, now) if cost_month > 0 else 0.0,
        "credits_remaining":    None,
        "input_tokens_month":   None,
        "output_tokens_month":  None,
        "sparkline":            _sparkline(db, "google_cse", now),
    }


async def _google_trends_stats(db: Session, now: datetime) -> dict:
    calls_today, calls_month = _db_counts(db, "google_trends", now)
    return {
        "id":                   "google_trends",
        "name":                 "Google Trends",
        "configured":           True,
        "status":               "ok",
        "calls_today":          calls_today,
        "calls_month":          calls_month,
        "cost_month":           0.0,
        "cost_projected_eom":   0.0,
        "credits_remaining":    None,
        "input_tokens_month":   None,
        "output_tokens_month":  None,
        "sparkline":            _sparkline(db, "google_trends", now),
    }


# ---------------------------------------------------------------------------
# Main route
# ---------------------------------------------------------------------------

@router.get("/api-usage")
async def get_api_usage(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """
    Aggregate API usage and estimated costs for all external services.

    Reads primarily from the api_usage_log table.  For Stability AI,
    also calls the live balance endpoint to show remaining credits.
    """
    now = datetime.now(timezone.utc)

    services = await asyncio.gather(
        _anthropic_stats(db, now),
        _stability_stats(db, now),
        _unsplash_stats(db, now),
        _tavily_stats(db, now),
        _google_cse_stats(db, now),
        _google_trends_stats(db, now),
    )

    total_cost_month     = round(sum(s["cost_month"]           for s in services), 4)
    total_cost_projected = round(sum(s["cost_projected_eom"]   for s in services), 4)

    return {
        "services":              list(services),
        "total_cost_month":      total_cost_month,
        "total_cost_projected_eom": total_cost_projected,
        "generated_at":          now.isoformat(),
    }
