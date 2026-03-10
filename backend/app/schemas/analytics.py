from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AnalyticsEventCreate(BaseModel):
    site_id: int
    article_id: Optional[int] = None
    event_type: str
    user_agent: Optional[str] = None


class AnalyticsEventResponse(BaseModel):
    id: int
    site_id: int
    article_id: Optional[int]
    event_type: str
    ip_hash: str
    user_agent: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
