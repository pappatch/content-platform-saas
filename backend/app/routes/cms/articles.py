"""
CMS article management routes.

All routes require authentication (get_current_user).
Write operations (create, update, delete) additionally require the editor role.

content_html is sanitized by sanitize_html() on every write to prevent XSS.
DELETE is implemented as a soft-delete (status=removed) to preserve audit trail.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.schemas.article import (
    ArticleCreate,
    ArticleUpdate,
    ArticleListResponse,
    ArticleDetailResponse,
)
from app.security.permissions import get_current_user, require_editor
from app.utils.sanitize import sanitize_html

router = APIRouter(prefix="/cms/articles", tags=["CMS - Articles"])


@router.get("/stats")
def get_article_stats(
    site_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Article.status, func.count(Article.id))
    if site_id:
        q = q.filter(Article.site_id == site_id)
    rows = q.group_by(Article.status).all()
    counts = {s.value: 0 for s in ArticleStatus}
    for stat, cnt in rows:
        counts[stat.value] = cnt
    return {"total": sum(counts.values()), **counts}


@router.get("", response_model=List[ArticleListResponse])
def list_articles(
    site_id: Optional[int] = Query(None),
    article_status: Optional[ArticleStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(Article)
    if site_id is not None:
        query = query.filter(Article.site_id == site_id)
    if article_status is not None:
        query = query.filter(Article.status == article_status)
    return query.order_by(Article.created_at.desc()).all()


@router.get("/{article_id}", response_model=ArticleDetailResponse)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    return article


@router.post("", response_model=ArticleDetailResponse, status_code=status.HTTP_201_CREATED)
def create_article(
    article_data: ArticleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_editor),
):
    if article_data.source_url:
        existing = db.query(Article).filter(Article.source_url == article_data.source_url).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_url already exists")
    data = article_data.model_dump()
    if data.get("content_html"):
        data["content_html"] = sanitize_html(data["content_html"])
    article = Article(**data)
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.patch("/{article_id}", response_model=ArticleDetailResponse)
def update_article(
    article_id: int,
    article_data: ArticleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_editor),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    data = article_data.model_dump(exclude_unset=True)
    if "content_html" in data and data["content_html"]:
        data["content_html"] = sanitize_html(data["content_html"])
    for field, value in data.items():
        setattr(article, field, value)
    db.commit()
    db.refresh(article)
    return article


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_editor),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    article.status = ArticleStatus.removed
    db.commit()
