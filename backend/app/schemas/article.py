from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, field_validator, model_validator
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
    pinned_until: Optional[datetime] = None
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
    pinned_until: Optional[datetime] = None
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
    pinned_until: Optional[datetime]
    # Reading time computed server-side from content_html (Article.reading_time_minutes property)
    reading_time_minutes: int = 1
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


class BulkArticleRequest(BaseModel):
    """Request body for PATCH /cms/articles/bulk."""
    ids: list[int]
    action: Literal["publish", "remove", "reassign-category"]
    category_id: Optional[int] = None

    @field_validator("ids")
    @classmethod
    def ids_not_empty(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("ids must not be empty")
        if len(v) > 500:
            raise ValueError("Cannot bulk-update more than 500 articles at once")
        return v

    @model_validator(mode="after")
    def category_required_for_reassign(self) -> "BulkArticleRequest":
        if self.action == "reassign-category" and self.category_id is None:
            raise ValueError("category_id is required for reassign-category action")
        return self


class BulkActionResult(BaseModel):
    """Response body for PATCH /cms/articles/bulk."""
    updated: int
    failed: int
    errors: list[str]
