import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
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
    url = Column(String, nullable=False)
    status = Column(Enum(ScrapeJobStatus), default=ScrapeJobStatus.pending, nullable=False)
    scraped_count = Column(Integer, default=0, nullable=True)
    error_message = Column(Text, nullable=True)
    frequency_minutes = Column(Integer, default=60, nullable=False)
    last_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    site = relationship("Site", back_populates="scrape_jobs")
