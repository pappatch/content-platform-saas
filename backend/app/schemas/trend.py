"""
Pydantic schemas for the Trends feature.

TrendResponse         — full trend row returned by GET /trends
SiteConfigPreview     — AI-generated site configuration preview
CreateSiteFromTrend   — payload for POST /trends/{id}/create-site
CreateSiteResult      — response after a site is created from a trend

TrendSettings         — active fetch-region setting (GET /trends/settings)
TrendSettingsUpdate   — payload for POST /trends/settings

RegionEntry           — one selectable region (geo code + display name)
RegionGroup           — labelled group of RegionEntry items
ExploreInterestPoint  — one date+value data point for the interest chart
ExploreCountry        — one country+value entry for the top-countries chart
ExploreQuery          — one related query entry
ExploreResult         — full response for GET /trends/explore
ExploreSiteResult     — site + scrape_job created via POST /trends/explore/create-site
"""

import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.models.trend import TrendStatus
from app.schemas.scrape_job import ScrapeJobResponse
from app.schemas.site import SiteResponse


class TrendResponse(BaseModel):
    """Single trending topic as returned by the API."""

    id: int
    keyword: str
    category: Optional[str]
    region: str
    language: str
    score: Optional[float]
    trend_date: str
    status: TrendStatus
    site_id: Optional[int]
    created_at: datetime

    # Computed server-side: True if this keyword was seen on a previous date
    is_duplicate: bool = False

    model_config = {"from_attributes": True}


class SiteConfigPreview(BaseModel):
    """
    AI-generated site configuration shown in the Create Site modal before
    the admin confirms.  All fields are editable before submission.
    """

    site_name: str
    domain_slug: str    # suggested URL-safe slug, e.g. "techbuzz-daily"
    language: str       # en / he / ar / fr
    template_id: str    # template-a … template-e
    config: dict        # brand colours: primary_color, secondary_color, etc.
    keywords: List[str] # search terms to seed the ScrapeJob
    description: str    # short site description (not stored; for UI preview only)


class CreateSiteFromTrend(BaseModel):
    """
    Optional override payload for POST /trends/{id}/create-site.

    If omitted entirely the server calls the AI to generate the config.
    If provided, the client's values take precedence over the AI defaults.
    """

    site_name: Optional[str] = None
    domain_slug: Optional[str] = None
    language: Optional[str] = None
    template_id: Optional[str] = None
    config: Optional[dict] = None
    keywords: Optional[List[str]] = None

    @field_validator("template_id")
    @classmethod
    def validate_template(cls, v: Optional[str]) -> Optional[str]:
        """Reject template IDs that do not exist in the renderer."""
        import re
        if v is not None and not re.match(r"^template-[a-e]$", v):
            raise ValueError("template_id must be one of: template-a … template-e")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("en", "fr", "he", "ar"):
            raise ValueError("language must be one of: en, fr, he, ar")
        return v


class CreateSiteResult(BaseModel):
    """Response returned after a site and scrape job are created from a trend."""

    trend: TrendResponse
    site: SiteResponse
    scrape_job: ScrapeJobResponse


# ---------------------------------------------------------------------------
# Settings schemas
# ---------------------------------------------------------------------------

class TrendSettings(BaseModel):
    """Current active fetch-region setting returned by GET /trends/settings."""

    fetch_region: str  # "" = worldwide, "US" = United States, etc.


class TrendSettingsUpdate(BaseModel):
    """Payload for POST /trends/settings."""

    fetch_region: str

    @field_validator("fetch_region")
    @classmethod
    def validate_region(cls, v: str) -> str:
        """Accept empty string (worldwide) or a 2-letter uppercase ISO code."""
        if v != "" and not re.match(r"^[A-Z]{2}$", v):
            raise ValueError(
                "fetch_region must be '' (worldwide) or a 2-letter uppercase ISO code"
            )
        return v


# ---------------------------------------------------------------------------
# Region catalogue schemas (GET /trends/regions)
# ---------------------------------------------------------------------------

class RegionEntry(BaseModel):
    """One selectable region."""

    geo: str   # ISO code or "" for worldwide
    name: str  # Human-readable label, e.g. "United States"


class RegionGroup(BaseModel):
    """A labelled group of regions, e.g. "Europe" containing country entries."""

    label: str
    regions: List[RegionEntry]


# ---------------------------------------------------------------------------
# Explore schemas (GET /trends/explore)
# ---------------------------------------------------------------------------

class ExploreInterestPoint(BaseModel):
    """One date + relative-interest value (0–100) from Google Trends."""

    date: str   # YYYY-MM-DD
    value: int  # 0–100 relative interest


class ExploreCountry(BaseModel):
    """One country entry in the top-countries chart."""

    country: str
    value: int  # 0–100 relative interest


class ExploreQuery(BaseModel):
    """One related query with its relative value."""

    query: str
    value: int  # 0–100


class ExploreResult(BaseModel):
    """Full response for GET /trends/explore."""

    keyword: str
    timeframe: str
    geo: str
    interest_over_time: List[ExploreInterestPoint]
    top_countries: List[ExploreCountry]
    related_queries: List[ExploreQuery]


class ExploreSiteResult(BaseModel):
    """Site + ScrapeJob created via POST /trends/explore/create-site."""

    site: SiteResponse
    scrape_job: ScrapeJobResponse
