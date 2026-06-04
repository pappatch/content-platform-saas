"""
Article ORM model and status enum.

An Article is the core content unit.  It belongs to a Site and optionally
to a Category and an editor (User).  Status transitions:

  pending  →  published  (auto-publish when ai_score >= threshold, or manual)
  pending  →  removed    (editor rejects)
  published → removed    (editor removes)

Articles are never hard-deleted; status=removed is the audit-safe equivalent.
"""

import enum
import re
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text, Enum
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
    source_url = Column(String, unique=True, index=True)
    status = Column(Enum(ArticleStatus), default=ArticleStatus.pending, index=True)

    # Primary image (first image found in article)
    main_image_url = Column(String, nullable=True)

    # Article body — clean semantic HTML
    content_html = Column(Text, nullable=True)

    # AI Review
    ai_score = Column(Float, nullable=True)
    ai_flags = Column(String, nullable=True)

    # SEO Enrichment
    seo_title = Column(String, nullable=True)
    seo_description = Column(String, nullable=True)
    seo_keywords = Column(String, nullable=True)

    # Translation
    translated_from = Column(String, nullable=True)  # original language code, e.g. "en"

    # Editorial
    is_pinned = Column(Boolean, default=False)
    pin_order = Column(Integer, nullable=True)
    # pinned_until: if set and > now(), article sorts to the top of the feed
    # and shows a live countdown badge on TemplateB.
    pinned_until = Column(DateTime, nullable=True)

    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    editor_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    site = relationship("Site", back_populates="articles")
    category = relationship("Category", back_populates="articles")
    editor = relationship("User", back_populates="articles")
    analytics_events = relationship("Analytics", back_populates="article")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # -----------------------------------------------------------------------
    # Computed properties (exposed via Pydantic from_attributes)
    # -----------------------------------------------------------------------

    @property
    def reading_time_minutes(self) -> int:
        """
        Estimate reading time from content_html at 200 words per minute.

        Strips HTML tags, collapses whitespace, counts words.
        Returns a minimum of 1 minute.  Used by ArticleListResponse and
        ArticleDetailResponse so the site-renderer can display 'X min read'
        without the client having to parse the full HTML.
        """
        if not self.content_html:
            return 1
        text = re.sub(r'<[^>]+>', ' ', self.content_html)
        text = re.sub(r'\s+', ' ', text).strip()
        words = len(text.split()) if text else 0
        return max(1, round(words / 200))
