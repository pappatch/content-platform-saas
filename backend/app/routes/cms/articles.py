from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.user import User
from app.schemas.article import ArticleCreate, ArticleUpdate, ArticleResponse
from app.security.permissions import get_current_user, require_editor

router = APIRouter(prefix="/cms/articles", tags=["CMS - Articles"])


@router.get("", response_model=List[ArticleResponse])
def list_articles(
    site_id: Optional[int] = Query(None),
    article_status: Optional[ArticleStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Article)
    if site_id is not None:
        query = query.filter(Article.site_id == site_id)
    if article_status is not None:
        query = query.filter(Article.status == article_status)
    return query.all()


@router.get("/{article_id}", response_model=ArticleResponse)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    return article


@router.post("", response_model=ArticleResponse, status_code=status.HTTP_201_CREATED)
def create_article(
    article_data: ArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    if article_data.source_url:
        existing = db.query(Article).filter(Article.source_url == article_data.source_url).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source_url already exists")
    article = Article(**article_data.model_dump())
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.patch("/{article_id}", response_model=ArticleResponse)
def update_article(
    article_id: int,
    article_data: ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    for field, value in article_data.model_dump(exclude_unset=True).items():
        setattr(article, field, value)
    db.commit()
    db.refresh(article)
    return article


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
    article.status = ArticleStatus.removed
    db.commit()
