import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey, Enum, event
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class SiteLanguage(enum.Enum):
    he = "he"
    ar = "ar"
    fr = "fr"
    en = "en"


class TextDirection(enum.Enum):
    rtl = "rtl"
    ltr = "ltr"


RTL_LANGUAGES = {SiteLanguage.he, SiteLanguage.ar}


def _derive_text_direction(language: SiteLanguage) -> TextDirection:
    return TextDirection.rtl if language in RTL_LANGUAGES else TextDirection.ltr


class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    domain = Column(String, unique=True, index=True, nullable=False)
    template_id = Column(String, nullable=False)  # template-a through template-e
    config = Column(JSON, nullable=False, default=dict)
    language = Column(Enum(SiteLanguage), nullable=False, default=SiteLanguage.en)
    text_direction = Column(Enum(TextDirection), nullable=False, default=TextDirection.ltr)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    articles = relationship("Article", back_populates="site")
    categories = relationship("Category", back_populates="site")
    scrape_jobs = relationship("ScrapeJob", back_populates="site")
    analytics_events = relationship("Analytics", back_populates="site")


@event.listens_for(Site, "before_insert")
def set_text_direction_on_insert(mapper, connection, target):
    if target.language is not None:
        target.text_direction = _derive_text_direction(target.language)


@event.listens_for(Site, "before_update")
def set_text_direction_on_update(mapper, connection, target):
    if target.language is not None:
        target.text_direction = _derive_text_direction(target.language)
