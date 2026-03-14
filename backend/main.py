import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine
from app.routes.auth import router as auth_router
from app.routes.sites.sites import router as sites_router
from app.routes.cms.articles import router as articles_router
from app.routes.cms.categories import router as categories_router
from app.routes.scraper.jobs import router as scraper_router
from app.routes.admin.analytics import router as analytics_router
from app.routes.public.public import router as public_router
from app.routes.admin.users import router as admin_users_router
from app.workers.scrape_worker import worker_loop
from app.workers.review_worker import review_worker_loop
from app.workers.trends_worker import trends_worker_loop
from app.routes.trends import router as trends_router
from app.routes.settings import router as settings_router
import app.models

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.

    On startup:
    1. Seeds platform settings defaults (idempotent — safe on every restart).
    2. Launches the scrape, review, and trends workers as asyncio Tasks.

    On shutdown: cancels all tasks and waits for clean termination.

    Schema is managed by Alembic — run `alembic upgrade head` before starting.
    """
    # Seed platform settings before workers start so they see correct values
    from app.services.settings_service import seed_defaults
    seed_defaults()

    scrape_task  = asyncio.create_task(worker_loop())
    review_task  = asyncio.create_task(review_worker_loop())
    trends_task  = asyncio.create_task(trends_worker_loop())
    logger.info("Application startup complete")
    try:
        yield
    finally:
        scrape_task.cancel()
        review_task.cancel()
        trends_task.cancel()
        for task in (scrape_task, review_task, trends_task):
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("Application shutdown complete")


app = FastAPI(
    title="Content Platform API",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(sites_router)
app.include_router(articles_router)
app.include_router(categories_router)
app.include_router(scraper_router)
app.include_router(analytics_router)
app.include_router(public_router)
app.include_router(admin_users_router)
app.include_router(trends_router)
app.include_router(settings_router)


@app.get("/health")
def health_check():
    """
    Lightweight liveness probe.

    Returns the current environment name (development / production) so
    infrastructure health checks can confirm the correct build is running.
    No sensitive data is exposed.
    """
    return {"status": "ok", "env": settings.app_env}
