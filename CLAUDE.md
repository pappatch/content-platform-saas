# CLAUDE.md

Single source of truth for any Claude session working on this repository.
**Always read this file fully before starting any task.**

---

## Project Overview

Multi-site SaaS content platform. Each "site" is an independent publication with its own domain, language, template, and brand colors. Content is sourced automatically via a scraper (Tavily + Google CSE), reviewed by AI (Claude Haiku), and optionally reviewed by human editors before publishing. The public-facing renderer serves each site as a standalone news/blog site.

**Stack:** FastAPI + SQLAlchemy (SQLite dev, Postgres-ready) + Alembic + React + Vite

**Started:** March 10, 2026 · **Developer:** Elad Cohen · **Target:** AWS

---

## Slash Commands

Custom commands live in `.claude/commands/`. Invoke with `/command-name` in any Claude Code session.

| Command | Description |
|---------|-------------|
| `/scrape` | Trigger a scrape job by ID; shows new articles summary and auto-publish results |
| `/review` | Show pending articles by site/score; approve or reject interactively |
| `/newsite` | Guided wizard to create a new site, scrape job, and renderer config |
| `/stats` | Full platform statistics: article counts, score distribution, job status, analytics |
| `/deploy` | AWS deployment checklist and status assessment |
| `/trends` | Show today's trending topics by region; dismiss or create sites from trends |

---

## Working Rules

1. **Always read CLAUDE.md before starting any task.**
2. **Always update CLAUDE.md at the end of every session** — mark completed items, update Next Steps, reflect architectural changes.
3. **When adding env vars**, update both `config.py` and `.env`.
4. **Keep services modular** — each service file has a single responsibility.
5. **All errors must be caught and logged** — never crash background workers.
6. **Auto-publish threshold is 0.5** — articles with `ai_score < 0.5` stay `pending` for editor review; articles scoring ≥ 0.5 are auto-published.
7. **Reject = PATCH status=removed, not DELETE** — articles are soft-deleted for audit trail.
8. **Never drop or recreate the DB** — always use `alembic upgrade head`.

---

## Local Dev

### Ports

| Port | Service |
|------|---------|
| 8000 | FastAPI backend |
| 5173 | Admin / CMS / Review frontend |
| 5174 | Site renderer — Site 1 (Shih Tzu, Hebrew RTL) |
| 5175 | Site renderer — Site 2 (Bonsai, English) |

### Starting servers

All backend commands run from `backend/` with the virtualenv active:

```bash
cd backend && source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

```bash
cd frontend && npm run dev        # http://localhost:5173
```

```bash
cd site-renderer && npm run dev   # http://localhost:5174  (set VITE_SITE_ID in .env)
```

### Running tests

```bash
cd backend && source .venv/bin/activate
pytest
pytest tests/test_auth.py                          # single file
pytest tests/test_auth.py::test_register_user     # single test
```

---

## Environment

`backend/.env` — required keys:

```
DATABASE_URL=sqlite:///./platform.db
SECRET_KEY=your-secret-key
TAVILY_API_KEY=tvly-...
GOOGLE_API_KEY=AIza...
GOOGLE_CSE_ID=...
ANTHROPIC_API_KEY=sk-ant-...
UNSPLASH_ACCESS_KEY=...
AI_REVIEW_THRESHOLD=0.5
TRENDS_AUTO_SITE_LIMIT=3
```

If you add a new env var, add it to both `app/config.py` (pydantic-settings field) and `.env`.

---

## Database Migrations (Alembic)

All commands from `backend/` with virtualenv active.

```bash
alembic upgrade head                              # apply all pending migrations
alembic revision --autogenerate -m "description" # generate after model change
alembic current                                   # show current revision
alembic history --verbose                         # full history
alembic downgrade -1                              # roll back one step
```

When adding a new model: import it in `alembic/env.py` so autogenerate detects it.

---

## Architecture

### Backend (`backend/`)

Entry point is `main.py`. Schema is owned by Alembic — `create_all` is not used.

```
backend/
  main.py               # FastAPI app, CORS, lifespan, router registration
  alembic.ini           # Alembic config (URL injected from .env via env.py)
  alembic/
    env.py              # Imports all models; render_as_batch=True for SQLite
    versions/           # Migration files — always commit these
  app/
    config.py           # pydantic-settings; reads .env
    database.py         # engine, SessionLocal, Base, get_db() dependency
    models/             # SQLAlchemy ORM models (all imported in models/__init__.py)
    schemas/            # Pydantic request/response schemas
    routes/
      auth.py           # /auth/register, /auth/login, /auth/me
      sites/            # /sites CRUD
      cms/              # /cms/articles, /cms/categories
      scraper/          # /scraper/jobs (create, run, delete)
      admin/            # /admin/users, /admin/analytics
      public/           # /public/* (unauthenticated renderer API)
    security/
      auth.py           # bcrypt hashing, JWT creation/decoding
      permissions.py    # get_current_user, require_admin, require_editor
    services/
      scraper.py        # Tavily + Google CSE → full HTML fetch → Article save
      ai_review.py      # Claude Haiku review + rewrite + scoring + translation
      image_service.py  # Unsplash API enrichment for articles missing main_image_url
      trends_service.py # pytrends fetch → dedup → DB; AI site config generation
    utils/
      sanitize.py       # HTML sanitizer blocking XSS / script injection
    workers/
      scrape_worker.py  # Background loop (60s): runs due scrape jobs
      review_worker.py  # Background loop (30s): AI review of pending articles
      trends_worker.py  # Background loop (5h): fetches Google Trends per region
```

### Frontend (`frontend/src/`)

Three micro-apps sharing one Vite build at port 5173:

| Path | Role | Auth |
|------|------|------|
| `/admin/*` | Sites, ScrapeJobs, Users management | `admin` only |
| `/cms/*` | Article & category editing | `editor` or `admin` |
| `/review/*` | Review queue | any authenticated user |

Shared infra: `AuthContext` (JWT in localStorage), `DirectionContext` (RTL/LTR), `@tanstack/react-query` for all API calls, axios client in `src/api/client.js`.

**Review queue** (`apps/review/`) is split into:
- `Dashboard.jsx` — orchestrator; owns `approveMut` (PATCH status=published) and `rejectMut` (PATCH status=removed); manages `previewId` and `confirmRejectId` state
- `ReviewQueue.jsx` — article list, filters, sort, 30s auto-refresh, inline approve button
- `ArticlePreviewModal.jsx` — lazy-fetches article detail; shows meta, flags, image, content, SEO, approve/reject actions
- `ConfirmDialog.jsx` — reject confirmation dialog (z-50+, red confirm button)

**Analytics dashboard** (`apps/admin/Dashboard.jsx`) uses recharts:
- 4 stat cards: published (green), pending (amber), removed (red), total (indigo)
- Stacked bar chart: articles per site by status
- Bar chart histogram: AI score in 10 buckets, colour-coded (red <50%, yellow 50–70%, green ≥70%)
- Line chart: page views per site over last 30 days from `GET /analytics`
- Graceful empty states on all charts

### Site Renderer (`site-renderer/`)

Separate Vite app at port 5174+. Set `VITE_SITE_ID` in its `.env` to select which site to render. Fetches from `/public/` endpoints — no auth required.

- **5 templates:** A (Newspaper), B (Magazine), C (Blog), D (Cards), E (Sidebar)
- `SiteContext` — fetches site + articles + categories; derives `siteKeywords` from site name + DEFAULT_KEYWORDS; exposes via context
- `utils/defaultImages.js` — `getDefaultImage(keywords, index)` cycles 5 Unsplash keywords by article ID; used as fallback when `main_image_url` is null
- All templates use `article.main_image_url || getDefaultImage(siteKeywords, article.id)` — never a broken image
- CSS custom properties for per-site brand colors, set dynamically from `site.config`
- Full RTL support: `tailwindcss-rtl` + `dir={site.text_direction}` on root element
- Pages: home (template router), `/article/:id`, `/category/:slug`, 404

### Data Model

- **User** — roles `admin | editor | viewer`, bcrypt password, JWT auth
- **Site** — `domain` (unique), `template_id` (template-a…e), `config` JSON (colors), `language` (en/he/ar/fr), auto-derived `text_direction` (RTL for he/ar)
- **Category** — scoped per site, URL `slug`
- **Article** — belongs to Site + optional Category/editor. Status: `pending → published | removed`. Key fields: `content_html` (Text), `main_image_url`, `ai_score` (0–1), `ai_flags`, `is_pinned`, `pin_order`, `translated_from`, all SEO fields (`seo_title`, `seo_description`, `seo_keywords`)
- **ScrapeJob** — `keywords` (JSON array), `language`, `frequency_minutes`, `category_rules`, `status`, `last_error`
- **Analytics** — page-view events per site/article, `created_at` timestamp
- **Trend** — keyword, region, language, score (rank-derived 0–1), trend_date (YYYY-MM-DD), status (`new → used | dismissed`), optional `site_id` FK when used to create a site
- **AppSetting** — key-value table for persistent feature settings. Current key: `trends_fetch_region` (ISO code or `""` for worldwide)
- **PlatformSetting** — typed key-value table for tunable runtime parameters. Fields: key (PK), value, value_type (string/float/int/bool), description, updated_by_id (FK User), updated_at. 8 seeded defaults (see settings_service.py DEFAULTS)

### Auth Flow

JWT issued at `/auth/login`. Claim `sub` = user ID (string), `role` = role value. Use `get_current_user` for protected routes, `require_admin` / `require_editor` for role-gated routes.

### Scraper Engine

`services/scraper.py`: keyword searches via Tavily (primary, provides `ai_score`) + Google CSE (secondary), deduplicates by URL (Tavily score wins), fetches full HTML via httpx with SSRF protection, saves new Articles. Max 10 URLs per job run.

- SSRF protection: scheme whitelist, RFC-1918 IP blocking, link-local/ULA IPv6 blocking
- Per-domain rate limiting (2s), max 5MB download, 15s timeout
- HTML parser extracts semantic blocks → `content_html`
- Quality gates: ≥3 paragraphs, ≥100 words

### AI Review Engine

`services/ai_review.py`: single Anthropic API call using `tool_use` + `tool_choice="tool"` for structured JSON.

- Model: `claude-haiku-4-5-20251001`, max 2048 tokens, input truncated to 4000 chars
- Produces: rewritten `content_html`, `title`, `score` (0–1), `flags[]`, `seo_title`, `seo_description`, `seo_keywords`
- Auto-detects source language; translates if source ≠ site language; sets `translated_from`
- RTL-aware prompt hints for Hebrew / Arabic
- After scoring: calls `image_service.enrich_article_images()` if `main_image_url` is null
- On any error: article stays `pending` (safe to retry)

### Image Service

`services/image_service.py`: calls Unsplash Search API to find a relevant image for new articles. Requires `UNSPLASH_ACCESS_KEY`. Returns `regular` URL or `None` if key missing / API error.

---

## Backend API Reference

```
POST   /auth/register
POST   /auth/login
GET    /auth/me

GET|POST|PATCH|DELETE  /sites

GET|POST|PATCH|DELETE  /cms/articles
GET                    /cms/articles/stats
GET|POST|PATCH|DELETE  /cms/categories

GET|POST|DELETE        /scraper/jobs
POST                   /scraper/jobs/{id}/run

GET    /public/sites/{id}
GET    /public/sites/{id}/articles      # pinned articles first
GET    /public/articles/{id}
GET    /public/sites/{id}/categories

GET              /trends                        # list trends (admin) — filters: status, language, date
GET              /trends/stats                  # summary counts + auto-site quota
GET              /trends/regions                # grouped region catalogue (static)
GET              /trends/settings               # active fetch-region setting
POST             /trends/settings               # update fetch-region (persisted in AppSetting)
POST             /trends/fetch                  # manually trigger a trends fetch (admin)
GET              /trends/explore                # pytrends: interest_over_time, top_countries, related_queries
GET              /trends/explore/site-config    # AI site config preview for raw keyword
POST             /trends/explore/create-site    # create Site + ScrapeJob from raw keyword
GET              /trends/{id}/site-config       # AI-generated site config preview (admin)
POST             /trends/{id}/dismiss           # dismiss a trend (admin)
POST             /trends/{id}/create-site       # create Site + ScrapeJob from trend (admin, max 3)

GET        /settings              # list all platform settings (admin)
PATCH      /settings/{key}        # update one setting (admin, validates value_type)

GET|PATCH  /admin/users
POST       /analytics/track
GET        /analytics
```

---

## Current Sites (DB)

| ID | Name | Template | Language | Direction | Notes |
|----|------|----------|----------|-----------|-------|
| 1  | Shih Tzu (Hebrew) | template-b | Hebrew | RTL | Active scrape job |
| 2  | Bonsai | template-b | English | LTR | Active scrape job |

---

## Project Status

### ✅ Completed

- FastAPI app: CORS, lifespan startup, router registration
- SQLAlchemy ORM + Alembic migrations
- JWT auth (PyJWT + bcrypt), role-based permissions (admin / editor / viewer)
- HTML sanitizer blocking XSS / script injection
- Background workers: `scrape_worker` (60s loop), `review_worker` (30s loop)
- Full data model: User, Site, Category, Article, ScrapeJob, Analytics
- Article uses single `content_html` field (migrated away from `article_blocks`)
- All Article fields: `main_image_url`, `translated_from`, `is_pinned`, `pin_order`, `ai_score`, `ai_flags`, all SEO fields
- Scraper: Tavily + Google CSE, SSRF protection, rate limiting, quality gates
- AI review: Claude Haiku, structured output via tool_use, translation, RTL hints
- Image service: Unsplash API enrichment post-AI-review
- All backend API routes working
- Admin frontend: Sites CRUD, ScrapeJobs (run/delete/create), Users management, Architecture reference page
- CMS Articles: list + filters (site/status/AI score/date), TipTap rich editor, SEO fields
- CMS Categories: list, create, edit, delete (slug validation)
- Review Queue: list, filters, sort, 30s refresh, approve/reject, full preview modal
- Analytics Dashboard: stat cards, stacked bar chart, AI score histogram, page views line chart
- Site renderer: all 5 templates (A–E), RTL support, per-site theming, default image fallbacks
- `defaultImages.js` utility: cycles 5 Unsplash keywords by article ID for consistent fallbacks
- `SiteContext` exposes `siteKeywords` derived from site name
- All broken-image `onError` fallbacks across all templates, ArticleCard, ArticleDetail
- `excerpt()` strips `content_html` (not dead `article.blocks` ref)
- RTL-aware back arrow in ArticleDetail, "Read more" arrow in TemplateC
- Auto-publish threshold set to 0.5 in config and .env
- Google Trends feature: `Trend` model, `trends_service.py` (RSS-based fetch), `trends_worker.py` (5h), `/trends` routes, `Trends.jsx` dashboard, `/trends` slash command
- Trends region selector: `AppSetting` key-value model persists `trends_fetch_region`; `GET/POST /trends/settings`; grouped region catalogue via `GET /trends/regions`; region dropdown + active badge in Trending tab
- Trends Explore tab: `GET /trends/explore` (pytrends interest/countries/queries); `GET /trends/explore/site-config`; `POST /trends/explore/create-site`; ExplorePanel with recharts LineChart + BarChart + related queries + Create Site modal
- Architecture page: `Architecture.jsx` at `/admin/architecture` — two-tab (Flow / Architecture) embedded reference diagram; pure React + Tailwind, no external libs; Flow tab shows full Trends + Content pipelines with decision node; Architecture tab shows 4 layered boxes (External Services → Backend → Frontend/Renderer → Database)
- Platform Settings system: `PlatformSetting` ORM model (`platform_settings` table, typed key-value with value_type/description/updated_by_id); `settings_service.py` (in-memory cache, lazy load, seed_defaults on startup); `GET /settings` + `PATCH /settings/{key}` (admin only); `Settings.jsx` panel with 4 grouped sections; all hardcoded constants in scraper.py/ai_review.py/trends_service.py/trends_worker.py replaced with `settings_service.get()` calls; auto-publish logic in ai_review.py now correctly honours both threshold and `auto_publish_enabled`

### 🔲 Next Steps (priority order)

1. **Bulk actions in CMS** — checkboxes partially exist in `Articles.jsx` but need backend: `PATCH /cms/articles/bulk` accepting array of IDs + action (publish/remove/reassign-category).

2. **Pin management UI** — `is_pinned` / `pin_order` fields exist on Article; need drag-and-drop or ordering UI in the CMS. Public API already returns pinned articles first.

3. **Analytics enhancement** — per-article page views, per-site traffic trends, unique visitor estimation. `POST /analytics/track` is already called by the renderer; data is collected but not fully surfaced.

4. **Scrape job status feedback** — `status` (pending/running/done/failed) and `last_error` fields exist on ScrapeJob but the admin UI doesn't show errors or last-run time clearly.

5. **Tests** — pytest infrastructure set up, auth tests exist. Need: scraper tests, AI review tests (mocked Anthropic client), public API integration tests.

6. **Postgres migration** — SQLite for dev; switch `DATABASE_URL` to RDS Postgres for production. No code changes needed — Alembic handles the schema.

7. **Rate limiting** — `POST /analytics/track` is unauthenticated and has no rate limiting; add slowapi or nginx rate limit before production. `POST /auth/login` and `POST /auth/register` similarly unprotected.

8. **DOMPurify on client** — `content_html` is sanitized server-side but rendered with `dangerouslySetInnerHTML` in both `site-renderer` and the review preview modal. Add DOMPurify as a defence-in-depth layer.

9. **VITE_API_URL** — frontend `api/client.js` now reads `import.meta.env.VITE_API_URL` (falls back to `localhost:8000`). Set this in `frontend/.env.production` before any deployment.

10. **Missing DB indexes** — see REVIEW.md for recommended indexes on `articles.status`, `articles.site_id`, and `analytics.created_at`.

---

## AWS Deployment (Planned)

- Not started as of March 2026
- Target: EC2 / ECS / Elastic Beanstalk (TBD)
- Database: RDS Postgres — just update `DATABASE_URL` in `.env`
- Static assets / renderer builds: S3 + CloudFront
- Each site renderer is a separate Vite build with `VITE_SITE_ID` baked in

---

## Code Review (March 2026)

Full audit conducted by Claude Code (claude-sonnet-4-6). See `/platform/REVIEW.md` for the complete findings.

### Critical issues fixed

| Issue | File | Fix |
|-------|------|-----|
| Self-registration privilege escalation | `app/routes/auth.py` | `register` now forces `role=viewer` regardless of request body |
| `connect_args` Postgres incompatibility | `app/database.py` | Only applied when DATABASE_URL starts with `sqlite` |
| Weak HTML sanitizer (missing svg/math/meta/template/srcdoc) | `app/utils/sanitize.py` | Added to denylist; improved comments explaining limitation |
| Hardcoded `localhost:8000` in frontend | `frontend/src/api/client.js` | Now reads `VITE_API_URL` env var with localhost fallback |

### Security invariants confirmed

- JWT `none` algorithm: SAFE — `decode_access_token` pins `algorithms=[settings.algorithm]`
- API keys: SAFE — all read from `Settings` (env vars); none hardcoded
- SSRF: SAFE — `validate_url()` resolves hostname and blocks RFC-1918/loopback/link-local
- SQL injection: SAFE — all queries use SQLAlchemy ORM (parameterised)
- CORS: SAFE — locked to localhost ports (dev); update for production
- Auth on routes: SAFE — all non-public routes require `get_current_user` or higher

---

## Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Content storage | Single `content_html` Text field | Simpler than block model; AI rewrites full HTML |
| AI model | Claude Haiku (`claude-haiku-4-5-20251001`) | Cheap, fast, structured via `tool_use` |
| Auto-publish threshold | 0.5 | Below → stays pending for human review |
| Reject action | `PATCH status=removed` | Soft delete preserves audit trail |
| Default images | Unsplash `source.unsplash.com/featured/?{keyword}` | No storage needed, always returns an image |
| Image cycling | `article.id % len(keywords)` | Consistent per-article, deterministic, no randomness |
| Site renderer | Separate Vite app per site | Clean isolation; `VITE_SITE_ID` selects site at build time |
| RTL support | `dir={site.text_direction}` on root + `tailwindcss-rtl` | Covers all templates and components automatically |
| Trends score | `1.0 - rank * 0.09` (rank 0–9) | Simple deterministic score; pytrends doesn't expose raw volume |
| Trends dedup | `(keyword, trend_date)` unique pair | Same keyword on a new day is a new row; UI shows "Seen before" badge |
| Auto-site limit | `TRENDS_AUTO_SITE_LIMIT=3` in config | Prevents uncontrolled site sprawl; enforced server-side in service layer |
| Trend regions | US, GB, IL, FR, SA → en/en/he/fr/ar | Covers all 4 supported site languages |
