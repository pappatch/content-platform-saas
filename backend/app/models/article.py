import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text, Enum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class ArticleStatus(enum.Enum):
    pending = "pending"       # scraped, awaiting AI review
    published = "published"   # auto-published
    removed = "removed"       # removed by editor


class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    source_url = Column(String, unique=True, index=True)
    status = Column(Enum(ArticleStatus), default=ArticleStatus.pending)

    # AI Review
    ai_score = Column(Float, nullable=True)
    ai_flags = Column(String, nullable=True)

    # SEO Enrichment
    seo_title = Column(String, nullable=True)
    seo_description = Column(String, nullable=True)
    seo_keywords = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    images = Column(JSON, nullable=True)          # list of all image URLs from source page

    # Translation
    translated_from = Column(String, nullable=True)  # original language code, e.g. "en"

    # Editorial
    is_pinned = Column(Boolean, default=False)
    pin_order = Column(Integer, nullable=True)

    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    editor_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    site = relationship("Site", back_populates="articles")
    category = relationship("Category", back_populates="articles")
    editor = relationship("User", back_populates="articles")
    analytics_events = relationship("Analytics", back_populates="article")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
