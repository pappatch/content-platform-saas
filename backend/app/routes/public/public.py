"""
Public (unauthenticated) API routes consumed by the site-renderer.

All endpoints in this router are intentionally open — they serve published
content to anonymous visitors.  Responses are filtered to only include
published articles and active sites.

NOTE: These endpoints return content_html which is rendered with
dangerouslySetInnerHTML in the browser.  The HTML is sanitized before
storage (app/utils/sanitize.py) but consider adding DOMPurify on the
client as an additional defence layer.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.category import Category
from app.models.site import Site
from app.schemas.article import ArticleListResponse, ArticleDetailResponse
from app.schemas.category import CategoryResponse
from app.schemas.site import SiteResponse

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/sites/{site_id}", response_model=SiteResponse)
def get_public_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.id == site_id, Site.is_active == True).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@router.get("/sites/{site_id}/articles", response_model=List[ArticleListResponse])
def get_public_articles(
    site_id: int,
    category_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Article).filter(
        Article.site_id == site_id,
        Article.status == ArticleStatus.published,
    )
    if category_id is not None:
        query = query.filter(Article.category_id == category_id)
    articles = query.all()

    pinned = sorted(
        [a for a in articles if a.is_pinned],
        key=lambda a: (a.pin_order if a.pin_order is not None else 0),
    )
    unpinned = sorted(
        [a for a in articles if not a.is_pinned],
        key=lambda a: a.created_at,
        reverse=True,
    )
    return pinned + unpinned


@router.get("/articles/{article_id}", response_model=ArticleDetailResponse)
def get_public_article(article_id: int, db: Session = Depends(get_db)):
    article = (
        db.query(Article)
        .filter(
            Article.id == article_id,
            Article.status == ArticleStatus.published,
        )
        .first()
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.get("/sites/{site_id}/categories", response_model=List[CategoryResponse])
def get_public_categories(site_id: int, db: Session = Depends(get_db)):
    return db.query(Category).filter(Category.site_id == site_id).all()
