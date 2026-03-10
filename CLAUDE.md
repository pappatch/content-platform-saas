# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All backend commands should be run from the `backend/` directory with the virtualenv activated:

```bash
cd backend
source .venv/bin/activate

# Run the dev server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest

# Run a single test file
pytest tests/test_auth.py

# Run a single test
pytest tests/test_auth.py::test_register_user
```

The app requires a `.env` file in `backend/` with at minimum:
```
DATABASE_URL=sqlite:///./platform.db
SECRET_KEY=your-secret-key
```

## Architecture

This is a multi-site content platform. The stack is:
- **Backend**: FastAPI + SQLAlchemy (SQLite by default) + Alembic for migrations
- **Frontend**: `frontend/src/` — directory scaffold only (empty), planned as separate React apps per sub-app
- **Site renderer**: `site-renderer/` — planned component (currently only a schema stub)
- **Configs**: `configs/` — site configuration schemas

### Backend structure (`backend/`)

The entry point is `main.py`. It creates all DB tables on startup via `Base.metadata.create_all` (no Alembic migrations set up yet) and registers routers.

```
backend/
  main.py               # FastAPI app, CORS, router registration
  app/
    config.py           # Settings via pydantic-settings, reads .env
    database.py         # SQLAlchemy engine, SessionLocal, get_db() dependency
    models/             # SQLAlchemy ORM models
    schemas/            # Pydantic request/response models
    routes/             # FastAPI routers (auth + 4 placeholder sub-routers)
      auth.py           # /auth/register, /auth/login, /auth/me
      admin/            # placeholder
      cms/              # placeholder
      scraper/          # placeholder
      sites/            # placeholder
    security/
      auth.py           # bcrypt password hashing, JWT token creation/decoding
      permissions.py    # FastAPI dependencies: get_current_user, require_admin, require_editor
    services/           # placeholder
    workers/            # placeholder
```

### Data model

- **User**: roles `admin | editor | viewer`, bcrypt password, JWT auth
- **Site**: multi-tenant sites identified by `domain`, each with a `template_id` (template-a through template-e) and a `config` JSON blob for design settings
- **Category**: scoped per-site, has a URL slug
- **Article**: belongs to a Site and optionally a Category/User editor. Has lifecycle status (`pending → published | removed`), AI review fields (`ai_score` float 0–1, `ai_flags` JSON string), SEO fields, and pinning support

### Auth flow

JWT tokens are issued at `/auth/login`. The `sub` claim holds the user ID (as string), `role` holds the role value. Use `get_current_user` dependency for protected routes, `require_admin` / `require_editor` for role-gated routes.

### Planned sub-systems (not yet implemented)

- `routes/admin/` — user/site management
- `routes/cms/` — article/category CRUD
- `routes/scraper/` — web scraping trigger + status
- `routes/sites/` — public site API
- `services/` + `workers/` — AI review pipeline, SEO enrichment, background tasks
- `frontend/src/apps/admin`, `cms`, `review` — three separate front-end micro-apps
- `site-renderer/` — template rendering engine for the five site templates
