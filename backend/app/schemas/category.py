import re
from typing import Optional
from pydantic import BaseModel, field_validator


class CategoryCreate(BaseModel):
    name: str
    slug: str
    site_id: int

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v):
        if not re.match(r"^[a-z0-9-]+$", v):
            raise ValueError("slug must contain only lowercase letters, numbers, and hyphens")
        return v


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v):
        if v is not None and not re.match(r"^[a-z0-9-]+$", v):
            raise ValueError("slug must contain only lowercase letters, numbers, and hyphens")
        return v


class CategoryResponse(BaseModel):
    id: int
    name: str
    slug: str
    site_id: int

    model_config = {"from_attributes": True}
