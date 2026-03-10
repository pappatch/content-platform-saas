import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class ScrapeJobStatus(enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)

    # Search terms — JSON array of strings, e.g. ["AI", "machine learning"]
    # NOTE: If upgrading an existing DB, run:
    #   ALTER TABLE scrape_jobs ADD COLUMN keywords JSON;
    #   ALTER TABLE scrape_jobs ADD COLUMN language VARCHAR(8) DEFAULT 'en';
    #   -- The old `url` column can be left in place or dropped manually.
    keywords = Column(JSON, nullable=False, default=list)

    # Target language for search ("en" | "fr" | "he" | "ar")
    language = Column(String(8), nullable=False, default="en")

    status = Column(Enum(ScrapeJobStatus), default=ScrapeJobStatus.pending, nullable=False)
    scraped_count = Column(Integer, default=0, nullable=True)
    error_message = Column(Text, nullable=True)
    frequency_minutes = Column(Integer, default=60, nullable=False)

    # Optional comma-separated keywords used to auto-tag scraped articles by category
    category_rules = Column(Text, nullable=True)

    last_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    site = relationship("Site", back_populates="scrape_jobs")
