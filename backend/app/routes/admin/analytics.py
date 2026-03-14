"""
Analytics routes.

POST /analytics/track — unauthenticated; called by the site renderer on every
    page view.  The caller's IP is SHA-256 hashed (never stored in plaintext).
    NOTE: This endpoint has no rate limiting.  A bot can flood it with fake
    events.  Consider adding a CAPTCHA or IP-based rate limiter for production.

GET  /analytics — admin-only; returns all stored events with optional filters.
"""

import hashlib
from typing import List, Optional
from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.analytics import Analytics
from app.schemas.analytics import AnalyticsEventCreate, AnalyticsEventResponse
from app.security.permissions import require_admin
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.post("/track", response_model=AnalyticsEventResponse, status_code=201)
def track_event(
    event_data: AnalyticsEventCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Record a page-view event from the site renderer (unauthenticated).

    The caller's IP address is SHA-256 hashed before storage so raw IPs
    are never persisted (GDPR-friendly).  The hash is not reversible.
    """
    raw_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(raw_ip.encode()).hexdigest()
    event = Analytics(
        site_id=event_data.site_id,
        article_id=event_data.article_id,
        event_type=event_data.event_type,
        ip_hash=ip_hash,
        user_agent=event_data.user_agent,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=List[AnalyticsEventResponse])
def list_events(
    site_id: Optional[int] = Query(None),
    article_id: Optional[int] = Query(None),
    event_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    List analytics events with optional filters (admin only).

    NOTE: This returns all matching rows with no pagination.  For large
    deployments consider adding limit/offset parameters.
    """
    query = db.query(Analytics)
    if site_id is not None:
        query = query.filter(Analytics.site_id == site_id)
    if article_id is not None:
        query = query.filter(Analytics.article_id == article_id)
    if event_type is not None:
        query = query.filter(Analytics.event_type == event_type)
    return query.order_by(Analytics.created_at.desc()).all()
