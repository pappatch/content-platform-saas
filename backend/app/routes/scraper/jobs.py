"""
Scrape job management routes.

GET    /scraper/jobs          — list jobs (any authenticated user)
GET    /scraper/jobs/{id}     — get one job (any authenticated user)
POST   /scraper/jobs          — create a job (admin only)
DELETE /scraper/jobs/{id}     — hard-delete a job (admin only)
POST   /scraper/jobs/{id}/run — manually trigger a job run (admin only)
"""

from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.scrape_job import ScrapeJob, ScrapeJobStatus
from app.models.user import User
from app.schemas.scrape_job import ScrapeJobCreate, ScrapeJobResponse
from app.security.permissions import get_current_user, require_admin
from app.services.scraper import scrape_and_save

router = APIRouter(prefix="/scraper/jobs", tags=["Scraper"])


@router.get("", response_model=List[ScrapeJobResponse])
def list_jobs(
    site_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ScrapeJob)
    if site_id is not None:
        query = query.filter(ScrapeJob.site_id == site_id)
    return query.order_by(ScrapeJob.created_at.desc()).all()


@router.get("/{job_id}", response_model=ScrapeJobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scrape job not found")
    return job


@router.post("", response_model=ScrapeJobResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    job_data: ScrapeJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    job = ScrapeJob(
        site_id=job_data.site_id,
        keywords=job_data.keywords,
        language=job_data.language,
        frequency_minutes=job_data.frequency_minutes,
        category_rules=job_data.category_rules,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scrape job not found")
    db.delete(job)
    db.commit()


@router.post("/{job_id}/run", response_model=ScrapeJobResponse)
def run_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Manually trigger a scrape job. Returns immediately; scraping runs in background."""
    job = db.query(ScrapeJob).filter(ScrapeJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scrape job not found")
    if job.status == ScrapeJobStatus.running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job is already running",
        )
    background_tasks.add_task(scrape_and_save, job_id)
    job.status = ScrapeJobStatus.running
    db.commit()
    db.refresh(job)
    return job
