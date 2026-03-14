import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from app.models.site import SiteLanguage, TextDirection


class SiteCreate(BaseModel):
    name: str
    domain: str
    template_id: str
    config: dict = {}
    language: SiteLanguage = SiteLanguage.en

    @field_validator("template_id")
    @classmethod
    def validate_template_id(cls, v):
        if not re.match(r"^template-[a-e]$", v):
            raise ValueError("template_id must be one of: template-a, template-b, template-c, template-d, template-e")
        return v


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    template_id: Optional[str] = None
    config: Optional[dict] = None
    language: Optional[SiteLanguage] = None
    is_active: Optional[bool] = None

    @field_validator("template_id")
    @classmethod
    def validate_template_id(cls, v):
        if v is not None and not re.match(r"^template-[a-e]$", v):
            raise ValueError("template_id must be one of: template-a, template-b, template-c, template-d, template-e")
        return v


class SiteResponse(BaseModel):
    id: int
    name: str
    domain: str
    template_id: str
    config: dict
    language: SiteLanguage
    text_direction: TextDirection
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SitePublicResponse(SiteResponse):
    """Extended site response for public/renderer consumers — includes scrape keywords."""
    scrape_keywords: list[str] = []
