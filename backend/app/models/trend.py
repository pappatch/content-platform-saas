"""
Trend ORM model and status enum.

A Trend represents a single trending keyword captured from Google Trends
for a specific region and date.  Status transitions:

  new  →  used       (a Site was created from this trend)
  new  →  dismissed  (admin dismissed the trend)

Deduplication key: (keyword, trend_date) — the same keyword can recur on
different days and will create a new row each time.  The frontend marks a
trend as "seen before" when a different date row for the same keyword already
exists with status=used or status=dismissed.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class TrendStatus(enum.Enum):
    new = "new"
    used = "used"           # a Site + ScrapeJob were created from this trend
    dismissed = "dismissed" # admin dismissed — will not surface again in UI


class Trend(Base):
    """Single trending keyword captured from Google Trends."""

    __tablename__ = "trends"

    id = Column(Integer, primary_key=True, index=True)

    # Core keyword and context
    keyword = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True)    # e.g. "Technology", "Entertainment"
    region = Column(String(10), nullable=False)  # ISO country code, e.g. "US", "IL"
    language = Column(String(8), nullable=False) # derived from region, e.g. "en", "he"

    # Relative score: 1.0 = #1 trending, 0.1 = #10 trending (rank-derived)
    score = Column(Float, nullable=True)

    # YYYY-MM-DD string — used as part of dedup key (keyword + trend_date)
    trend_date = Column(String(10), nullable=False, index=True)

    # Lifecycle
    status = Column(Enum(TrendStatus), default=TrendStatus.new, nullable=False, index=True)

    # Set when this trend is used to create a site
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    site = relationship("Site", foreign_keys=[site_id])

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
