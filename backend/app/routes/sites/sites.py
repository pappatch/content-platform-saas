from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.site import Site
from app.models.user import User
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse
from app.security.permissions import get_current_user, require_admin

router = APIRouter(prefix="/sites", tags=["Sites"])


@router.get("", response_model=List[SiteResponse])
def list_sites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Site).filter(Site.is_active == True).all()


@router.get("/{site_id}", response_model=SiteResponse)
def get_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
def create_site(
    site_data: SiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(Site).filter(Site.domain == site_data.domain).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain already registered")
    site = Site(**site_data.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@router.patch("/{site_id}", response_model=SiteResponse)
def update_site(
    site_id: int,
    site_data: SiteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    updates = site_data.model_dump(exclude_unset=True)
    if "domain" in updates:
        conflict = db.query(Site).filter(Site.domain == updates["domain"], Site.id != site_id).first()
        if conflict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain already registered")
    for field, value in updates.items():
        setattr(site, field, value)
    db.commit()
    db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    site.is_active = False
    db.commit()
