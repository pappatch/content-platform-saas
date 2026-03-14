"""
Pydantic schemas for the Platform Settings feature.

PlatformSettingResponse  — single setting row returned by GET /settings
                           and PATCH /settings/{key}.
PlatformSettingUpdate    — request body for PATCH /settings/{key}.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PlatformSettingResponse(BaseModel):
    """Full representation of one platform setting, as returned by the API."""

    key: str
    value: str
    value_type: str           # "string" | "float" | "int" | "bool"
    description: str
    updated_by_id: Optional[int]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PlatformSettingUpdate(BaseModel):
    """
    Request body for PATCH /settings/{key}.

    The value is always sent as a string — the backend validates and casts it
    to the correct type based on the key's declared value_type.
    """

    value: str
