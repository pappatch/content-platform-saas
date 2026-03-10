from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import engine, Base

settings = get_settings()

# יצירת כל טבלאות ה-DB בהפעלה ראשונה
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Content Platform API",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None  # Swagger רק ב-development
)

# CORS — רק מקורות מוגדרים מותרים
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "env": settings.app_env}
