# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All backend commands run from `backend/` with the virtualenv active:

```bash
cd backend
source .venv/bin/activate
```

**Dev server**
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Tests**
```bash
pytest
pytest tests/test_auth.py               # single file
pytest tests/test_auth.py::test_register_user  # single test
```

**Frontend (admin)**
```bash
cd frontend && npm run dev    # http://localhost:5173
```

**Site renderer**
```bash
cd site-renderer && npm run dev  # http://localhost:5174
```

## Database Migrations (Alembic)

**Always use Alembic to change the schema. Never drop or recreate the DB.**

All migration commands run from `backend/` with the virtualenv active.

**Apply all pending migrations** (run this after pulling changes or on first setup):
```bash
alembic upgrade head
```

**After changing a model** — generate a migration automatically:
```bash
alembic revision --autogenerate -m "describe what changed"
# Review the generated file in alembic/versions/, then apply:
alembic upgrade head
```

**Check current revision:**
```bash
alembic current
```

**View migration history:**
```bash
alembic history --verbose
```

**Roll back one migration:**
```bash
alembic downgrade -1
```

**Adding a new model:** import it in `alembic/env.py` alongside the existing imports so autogenerate detects it.

## Architecture

Multi-site content platform. Stack: FastAPI + SQLAlchemy (SQLite by default, Postgres-ready) + Alembic + React.

### Backend (`backend/`)

Entry point is `main.py`. Schema is owned by Alembic — `create_all` has been removed.

```
backend/
  main.py               # FastAPI app, CORS, lifespan, router registration
  alembic.ini           # Alembic config (URL injected from .env via env.py)
  alembic/
    env.py              # Imports all models; sets render_as_batch=True for SQLite
    versions/           # Migration files — commit these to git
  app/
    config.py           # pydantic-settings; reads .env
    database.py         # engine, SessionLocal, Base, get_db() dependency
    models/             # SQLAlchemy ORM models (all imported in models/__init__.py)
    schemas/            # Pydantic request/response schemas
    routes/             # FastAPI routers
      auth.py           # /auth/register, /auth/login, /auth/me
      sites/            # /sites CRUD
      cms/              # /cms/articles, /cms/categories
      scraper/          # /scraper/jobs (create, run, delete)
      admin/            # /admin/users, /admin/analytics
      public/           # /public/sites (unauthenticated renderer API)
    security/
      auth.py           # bcrypt hashing, JWT creation/decoding
      permissions.py    # get_current_user, require_admin, require_editor
    services/
      scraper.py        # Tavily + Google CSE search → full HTML fetch → Article save
    workers/
      scrape_worker.py  # Background loop: runs due scrape jobs
      review_worker.py  # Background loop: AI review of pending articles
```

### Frontend (`frontend/src/`)

Three micro-apps sharing one Vite build:

| Path | Role | Auth |
|------|------|------|
| `/admin/*` | Site/job/user management | `admin` only |
| `/cms/*` | Article & category editing | `editor` or `admin` |
| `/review/*` | Review queue | any authenticated user |

Shared infra: `AuthContext` (JWT), `DirectionContext` (RTL/LTR), `@tanstack/react-query` for all API calls, axios client in `src/api/client.js`.

### Site Renderer (`site-renderer/`)

Separate Vite app at port 5174. Reads `VITE_SITE_ID` to know which site to render. Five templates (A–E). Fetches data from `/public/` endpoints — no auth required.

### Data model

- **User** — roles `admin | editor | viewer`, bcrypt password, JWT auth
- **Site** — `domain` (unique), `template_id` (template-a … template-e), `config` JSON (colors, image_position), `language`, `text_direction`
- **Category** — scoped per site, URL `slug`
- **Article** — belongs to Site + optional Category/editor. Status: `pending → published | removed`. Fields: `ai_score` (Tavily relevance 0–1), `ai_flags`, SEO fields, `is_pinned`
- **ScrapeJob** — `keywords` (JSON array), `language`, `frequency_minutes`, `category_rules`
- **Analytics** — page-view events per site/article

### Auth flow

JWT issued at `/auth/login`. Claim `sub` = user ID (string), `role` = role value. Use `get_current_user` for protected routes, `require_admin` / `require_editor` for role-gated routes.

### Scraper engine

`services/scraper.py` runs keyword searches via **Tavily** (primary, provides `ai_score`) and **Google CSE** (secondary), merges/deduplicates results, fetches full HTML via httpx with SSRF protection, and saves new Articles. Max 10 URLs processed per job run. API keys: `TAVILY_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` in `.env`.

## Environment

`backend/.env` minimum:
```
DATABASE_URL=sqlite:///./platform.db
SECRET_KEY=your-secret-key
TAVILY_API_KEY=tvly-...
GOOGLE_API_KEY=AIza...
GOOGLE_CSE_ID=...
ANTHROPIC_API_KEY=sk-ant-...
```
