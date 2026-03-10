from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}  # נדרש רק ל-SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    Dependency לשימוש ב-FastAPI routes.
    מחזיר session ומוודא שנסגר בסיום הבקשה.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
