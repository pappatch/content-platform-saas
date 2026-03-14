"""
PlatformSetting ORM model — typed key-value store for tunable runtime parameters.

This replaces ad-hoc hardcoded constants across scraper.py, ai_review.py, and
trends_service.py with a single DB-backed, admin-editable settings table.

Design notes
------------
- `value` is always stored as a UTF-8 string.  The `value_type` column records
  the intended Python type so the settings service can cast on read.
- `updated_by_id` links to the admin user who last changed the setting.
  It is nullable so system-seeded defaults don't require a user FK.
- Changes are reflected at runtime without a restart because the settings
  service cache is invalidated on every write.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class ValueType(str, enum.Enum):
    """Declared type of a platform setting value."""

    string = "string"
    float  = "float"
    int    = "int"
    bool   = "bool"


class PlatformSetting(Base):
    """One row per platform setting key."""

    __tablename__ = "platform_settings"

    # Human-readable snake_case identifier, e.g. "ai_review_threshold"
    key = Column(String, primary_key=True, nullable=False)

    # String-encoded value.  Callers use settings_service.get() for typed reads.
    value = Column(String, nullable=False)

    # Declared type — used by settings_service._cast() to convert on read.
    value_type = Column(String, nullable=False, default=ValueType.string)

    # Human-readable description shown in the admin settings panel.
    description = Column(String, nullable=False, default="")

    # FK to the User who last saved this setting.  Null = seeded by the system.
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )

    # Lazy relationship — loaded only when accessed (avoids circular imports)
    updated_by = relationship("User", foreign_keys=[updated_by_id], lazy="select")
