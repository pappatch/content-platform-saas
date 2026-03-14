"""
AppSetting ORM model — simple key-value store for persistent application settings.

Used for settings that must survive server restarts without requiring a dedicated
config table per feature.

Current keys
------------
trends_fetch_region : ISO-3166-1 alpha-2 code for the Google Trends RSS fetch.
                      Empty string ("") means worldwide (no geo filter).
                      Example values: "", "US", "GB", "IL", "FR", "SA".
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String

from app.database import Base


class AppSetting(Base):
    """Single row in the app_settings table — one row per key."""

    __tablename__ = "app_settings"

    # Primary key is the setting name, e.g. "trends_fetch_region"
    key = Column(String, primary_key=True)

    # String-encoded value — callers are responsible for type conversion
    value = Column(String, nullable=False)

    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
