from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import engine, Base
from app.routes.auth import router as auth_router
from app.routes.sites.sites import router as sites_router
from app.routes.cms.articles import router as articles_router
from app.routes.cms.categories import router as categories_router
from app.routes.scraper.jobs import router as scraper_router
from app.routes.admin.analytics import router as analytics_router
import app.models

settings = get_settings()

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Content Platform API",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


@app.get("/health")
def health_check():
    return {"status": "ok", "env": settings.app_env}
