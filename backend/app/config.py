"""
Application settings loaded from environment variables / .env file.

All sensitive values (secret_key, API keys) must be provided via environment
variables.  They must never be hardcoded here.  The .env file is gitignored
and only used for local development.
"""

from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    Pydantic-settings model that reads configuration from the environment.

    Required vars: DATABASE_URL, SECRET_KEY.
    Optional vars: all API keys and feature flags (safe defaults provided).
    """

    # Database
    database_url: str

    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # App
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True

    # AI Review
    ai_review_threshold: float = 0.5
    anthropic_api_key: Optional[str] = None

    # Search providers — set in .env, never hardcode
    tavily_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    google_cse_id: Optional[str] = None

    # Image enrichment
    unsplash_access_key: Optional[str] = None

    # Logo generation
    stability_api_key: Optional[str] = None

    # SerpAPI — primary source for Google Trends data (explore + trending now)
    serpapi_key: Optional[str] = None

    # Google Trends — max number of sites auto-created via the trends feature
    trends_auto_site_limit: int = 3

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()
