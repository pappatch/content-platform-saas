from datetime import datetime
from typing import Optional
from pydantic import BaseModel, HttpUrl
from app.models.scrape_job import ScrapeJobStatus


class ScrapeJobCreate(BaseModel):
    site_id: int
    url: HttpUrl
    frequency_minutes: int = 60
    category_rules: Optional[str] = None


class ScrapeJobResponse(BaseModel):
    id: int
    site_id: int
    url: str
    status: ScrapeJobStatus
    scraped_count: int
    error_message: Optional[str]
    frequency_minutes: int
    category_rules: Optional[str]
    last_run: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
