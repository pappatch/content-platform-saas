"""
ApiUsageLog model — lightweight per-call telemetry for all external API integrations.

Each row records one outbound API call made by any platform service.
Used by GET /admin/api-usage to build the cost/usage dashboard without
depending on external usage APIs that may be unavailable or rate-limited.

Fields
------
service:   slug identifying the provider  (anthropic, unsplash, tavily,
           google_cse, google_trends, stability_ai)
endpoint:  specific operation            (messages_create, search_photos, …)
timestamp: UTC timestamp of the call
success:   whether the call returned a usable result
meta:      optional JSON blob            (tokens, credits, model name, …)
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


class ApiUsageLog(Base):
    __tablename__ = "api_usage_log"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    service   = Column(String(50),  nullable=False, index=True)
    endpoint  = Column(String(100), nullable=False)
    timestamp = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    success   = Column(Boolean, nullable=False, default=True)
    meta      = Column(Text, nullable=True)   # JSON blob — optional extra data
