from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, field_validator
from app.models.scrape_job import ScrapeJobStatus


class ScrapeJobCreate(BaseModel):
    site_id: int
    keywords: List[str]
    language: str = "en"
    frequency_minutes: int = 60
    category_rules: Optional[str] = None

    @field_validator("keywords")
    @classmethod
    def keywords_not_empty(cls, v: List[str]) -> List[str]:
        cleaned = [k.strip() for k in v if k.strip()]
        if not cleaned:
            raise ValueError("At least one keyword is required")
        return cleaned

    @field_validator("language")
    @classmethod
    def language_supported(cls, v: str) -> str:
        if v not in ("en", "fr", "he", "ar"):
            raise ValueError("Language must be one of: en, fr, he, ar")
        return v

    @field_validator("frequency_minutes")
    @classmethod
    def frequency_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("frequency_minutes must be at least 1")
        return v


class ScrapeJobResponse(BaseModel):
    id: int
    site_id: int
    keywords: List[str]
    language: str
    status: ScrapeJobStatus
    scraped_count: int
    error_message: Optional[str]
    frequency_minutes: int
    category_rules: Optional[str]
    last_run: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
