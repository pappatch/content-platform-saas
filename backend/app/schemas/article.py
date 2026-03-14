from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.article import ArticleStatus


class ArticleCreate(BaseModel):
    title: str
    source_url: Optional[str] = None
    status: ArticleStatus = ArticleStatus.pending
    main_image_url: Optional[str] = None
    content_html: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None
    translated_from: Optional[str] = None
    is_pinned: bool = False
    pin_order: Optional[int] = None
    site_id: int
    category_id: Optional[int] = None
    editor_id: Optional[int] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    source_url: Optional[str] = None
    status: Optional[ArticleStatus] = None
    main_image_url: Optional[str] = None
    content_html: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None
    translated_from: Optional[str] = None
    is_pinned: Optional[bool] = None
    pin_order: Optional[int] = None
    category_id: Optional[int] = None
    editor_id: Optional[int] = None


class ArticleListResponse(BaseModel):
    """Lightweight response for list endpoints — no body HTML."""
    id: int
    title: str
    source_url: Optional[str]
    status: ArticleStatus
    ai_score: Optional[float]
    ai_flags: Optional[str]
    main_image_url: Optional[str]
    seo_title: Optional[str]
    seo_description: Optional[str]
    seo_keywords: Optional[str]
    translated_from: Optional[str]
    is_pinned: bool
    pin_order: Optional[int]
    site_id: int
    category_id: Optional[int]
    editor_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleDetailResponse(ArticleListResponse):
    """Full response for single-article endpoints — includes body HTML."""
    content_html: Optional[str] = None


# Keep ArticleResponse as an alias so public.py still works without changes
ArticleResponse = ArticleDetailResponse
