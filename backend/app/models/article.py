from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
from app.database import Base


class ArticleStatus(enum.Enum):
    pending = "pending"       # נסרק, ממתין ל-AI review
    published = "published"   # פורסם אוטומטית
    removed = "removed"       # הוסר ע"י עורך


class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    source_url = Column(String, unique=True, index=True)  # למניעת כפילויות
    status = Column(Enum(ArticleStatus), default=ArticleStatus.pending)

    # AI Review
    ai_score = Column(Float, nullable=True)       # 0.0 עד 1.0
    ai_flags = Column(String, nullable=True)      # הערות AI כ-JSON string

    # SEO Enrichment
    seo_title = Column(String, nullable=True)
    seo_description = Column(String, nullable=True)
    seo_keywords = Column(String, nullable=True)
    image_url = Column(String, nullable=True)

    # Editorial
    is_pinned = Column(Boolean, default=False)
    pin_order = Column(Integer, nullable=True)    # סדר הצגה במוצמדים

    # קשרים
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    editor_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # מי ערך

    site = relationship("Site", back_populates="articles")
    category = relationship("Category", back_populates="articles")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
