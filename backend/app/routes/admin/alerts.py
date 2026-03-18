"""
Alerts admin routes.

GET    /admin/alerts              — list alerts (unread count + paginated list)
PATCH  /admin/alerts/{id}/read    — mark one alert as read
PATCH  /admin/alerts/read-all     — mark all alerts as read
DELETE /admin/alerts/{id}         — delete one alert (hard delete — alerts are not content)
DELETE /admin/alerts/bulk         — delete multiple alerts by ID list
DELETE /admin/alerts/all          — delete all alerts (optionally filtered by level)
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.alert import Alert
from app.security.permissions import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AlertBulkDeleteRequest(BaseModel):
    ids: List[int]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_LEVELS = {"critical", "warning", "info"}


def _alert_to_dict(alert: Alert) -> dict:
    return {
        "id":          alert.id,
        "level":       alert.level,
        "title":       alert.title,
        "message":     alert.message,
        "source":      alert.source,
        "is_read":     alert.is_read,
        "created_at":  alert.created_at.isoformat() if alert.created_at else None,
        "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/alerts")
def list_alerts(
    level:    Optional[str] = Query(None, description="Filter by level: critical/warning/info"),
    is_read:  Optional[bool] = Query(None, description="Filter by read status"),
    limit:    int  = Query(50,  ge=1, le=200),
    offset:   int  = Query(0,   ge=0),
    db:       Session = Depends(get_db),
    _:        None    = Depends(require_admin),
):
    """
    Return alerts in reverse chronological order with an unread count.

    Optional filters:
    - level:   critical | warning | info
    - is_read: true / false
    """
    q = db.query(Alert)

    if level is not None:
        if level not in _VALID_LEVELS:
            raise HTTPException(status_code=422, detail=f"Invalid level: {level}")
        q = q.filter(Alert.level == level)

    if is_read is not None:
        q = q.filter(Alert.is_read == is_read)

    total        = q.count()
    unread_count = db.query(Alert).filter(Alert.is_read == False).count()  # noqa: E712

    alerts = (
        q.order_by(Alert.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "unread_count": unread_count,
        "total":        total,
        "alerts":       [_alert_to_dict(a) for a in alerts],
    }


@router.patch("/alerts/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    _:  None    = Depends(require_admin),
):
    """Mark all unread alerts as read."""
    updated = (
        db.query(Alert)
        .filter(Alert.is_read == False)  # noqa: E712
        .all()
    )
    now = datetime.now(timezone.utc)
    for alert in updated:
        alert.is_read    = True
        alert.resolved_at = now
    db.commit()
    return {"marked_read": len(updated)}


@router.patch("/alerts/{alert_id}/read")
def mark_one_read(
    alert_id: int,
    db:       Session = Depends(get_db),
    _:        None    = Depends(require_admin),
):
    """Mark a single alert as read."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read     = True
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return _alert_to_dict(alert)


@router.delete("/alerts/bulk")
def delete_alerts_bulk(
    body: AlertBulkDeleteRequest,
    db:   Session = Depends(get_db),
    _:    None    = Depends(require_admin),
):
    """Hard-delete multiple alerts by ID. Returns count of deleted records."""
    if not body.ids:
        return {"deleted": 0}
    deleted = (
        db.query(Alert)
        .filter(Alert.id.in_(body.ids))
        .all()
    )
    count = len(deleted)
    for alert in deleted:
        db.delete(alert)
    db.commit()
    return {"deleted": count}


@router.delete("/alerts/all")
def delete_alerts_all(
    level: Optional[str] = Query(None, description="Level to delete: critical/warning/info/all — omit for all"),
    db:    Session = Depends(get_db),
    _:     None    = Depends(require_admin),
):
    """Hard-delete all alerts, optionally filtered by level."""
    q = db.query(Alert)
    if level and level != "all":
        if level not in _VALID_LEVELS:
            raise HTTPException(status_code=422, detail=f"Invalid level: {level}")
        q = q.filter(Alert.level == level)
    alerts = q.all()
    count = len(alerts)
    for alert in alerts:
        db.delete(alert)
    db.commit()
    return {"deleted": count}


@router.post("/alerts/test")
def create_test_alert(
    db: Session = Depends(get_db),
    _:  None    = Depends(require_admin),
):
    """
    Create a test critical alert to verify the full alert UI flow.
    Useful for confirming the thermometer, bell badge, and Alerts page
    all update correctly without waiting for a real failure.
    """
    now   = datetime.now(timezone.utc)
    alert = Alert(
        level      = "critical",
        title      = "Test alert",
        message    = "This is a manually triggered test alert. You can safely delete it. If you can see this in the bell dropdown and on the Alerts page, the alert system is working correctly.",
        source     = "test",
        is_read    = False,
        created_at = now,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    logger.info("Test alert created (id=%d)", alert.id)
    return _alert_to_dict(alert)


@router.delete("/alerts/{alert_id}")
def delete_alert(
    alert_id: int,
    db:       Session = Depends(get_db),
    _:        None    = Depends(require_admin),
):
    """Hard-delete an alert. Alerts are operational records — deletion is acceptable."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"deleted": alert_id}
