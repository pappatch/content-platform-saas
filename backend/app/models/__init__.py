"""
Import all ORM models so that:
  1. SQLAlchemy's mapper registry is fully populated before any query.
  2. Alembic's autogenerate can detect all tables via Base.metadata.

NOTE: article_block.BlockType is an enum-only module with no DB table.
It is imported here only so that the scraper service can use it without
a circular import.  It does not add any table to Base.metadata.
"""

from app.models.user import User, UserRole
from app.models.site import Site, SiteLanguage, TextDirection
from app.models.category import Category
from app.models.article import Article, ArticleStatus
from app.models.article_block import BlockType  # enum only — no DB table
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
from app.models.analytics import Analytics
from app.models.trend import Trend, TrendStatus
from app.models.app_setting import AppSetting
from app.models.platform_settings import PlatformSetting, ValueType
