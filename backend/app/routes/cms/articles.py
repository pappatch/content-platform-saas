"""
CMS article management routes.

All routes require authentication (get_current_user).
Write operations (create, update, delete) additionally require the editor role.

content_html is sanitized by sanitize_html() on every write to prevent XSS.
DELETE is implemented as a soft-delete (status=removed) to preserve audit trail.
PATCH /bulk executes multi-article actions atomically in a single transaction.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.category import Category
from app.schemas.article import (
    ArticleCreate,
    ArticleUpdate,
    ArticleListResponse,
    ArticleDetailResponse,
    BulkArticleRequest,
    BulkActionResult,
)
from app.security.permissions import get_current_user, require_editor
from app.utils.sanitize import sanitize_html

logger = logging.getLogger(__name__)

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


@router.patch("/bulk", response_model=BulkActionResult)
def bulk_update_articles(
    request: BulkArticleRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_editor),
):
    """
    Apply a single action to multiple articles in one atomic transaction.

    Actions:
      publish             — set status=published
      remove              — set status=removed  (soft-delete)
      reassign-category   — set category_id; category must belong to the same site

    All IDs that exist are updated together; IDs not found are counted as failed.
    Returns {updated, failed, errors}.
    """
    updated = 0
    failed = 0
    errors: list[str] = []

    # Pre-fetch requested articles in one query
    articles = db.query(Article).filter(Article.id.in_(request.ids)).all()
    found_ids = {a.id for a in articles}

    # Report any IDs that don't exist
    for missing_id in set(request.ids) - found_ids:
        failed += 1
        errors.append(f"Article {missing_id} not found")

    # For reassign-category, validate the category exists once up-front
    category_site_map: dict[int, int] = {}  # category_id → site_id
    if request.action == "reassign-category":
        cat = db.query(Category).filter(Category.id == request.category_id).first()
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Category {request.category_id} not found",
            )
        category_site_map[cat.id] = cat.site_id

    try:
        for article in articles:
            try:
                if request.action == "publish":
                    article.status = ArticleStatus.published
                elif request.action == "remove":
                    article.status = ArticleStatus.removed
                elif request.action == "reassign-category":
                    cat_site = category_site_map.get(request.category_id)
                    if cat_site != article.site_id:
                        failed += 1
                        errors.append(
                            f"Article {article.id}: category {request.category_id} "
                            f"belongs to site {cat_site}, not site {article.site_id}"
                        )
                        continue
                    article.category_id = request.category_id
                updated += 1
            except Exception as e:
                logger.exception("Bulk action failed for article %s", article.id)
                failed += 1
                errors.append(f"Article {article.id}: {str(e)}")

        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("Bulk update transaction rolled back")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk update failed: {str(e)}",
        )

    return BulkActionResult(updated=updated, failed=failed, errors=errors)


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
