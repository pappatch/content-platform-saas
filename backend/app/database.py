from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import get_settings

settings = get_settings()

# connect_args={"check_same_thread": False} is only valid for SQLite.
# When DATABASE_URL points at Postgres (production) this arg must be omitted.
_connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    FastAPI dependency that provides a database session per request.

    Yields a SQLAlchemy Session and guarantees it is closed after the
    request completes, whether or not an exception was raised.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
