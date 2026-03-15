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
| `/api-costs` | Cost summary report from api_usage_log — calls and estimated spend per service for current month |
| `/refactor` | Scan `frontend/src/` for duplicate components, copy-pasted logic, and misplaced shared code; auto-refactor on confirmation |

---

## Working Rules

1. **Always read CLAUDE.md before starting any task.**
2. **After every task, mandatory updates to ALL of the following:**
   - **(1) CLAUDE.md** — mark completed items in the Completed section; update the Architecture section if structure changed; update the API Reference if routes were added/modified; update the Data Model if ORM models changed; update Next Steps to reflect remaining work.
   - **(2) REVIEW.md** — append any new code findings, security observations, or technical debt identified during the task (even if minor). Never skip this even for small tasks.
   - **(3) Architecture.jsx** — reflect any new services, routes, models, or frontend components in both the Flow tab and the Architecture tab. Update stat counters and layer descriptions.
   - **(4) `.claude/commands/`** — update relevant slash commands if new features, routes, or models affect their queries or descriptions.
   - **(5) Code review** — before finishing any task, scan every changed file for: unused imports, missing error handling, hardcoded values, and security issues (unprotected routes, exposed keys, missing input validation). Fix any critical issues found before committing.
   - **(6) Security review** — verify every new backend route has the correct auth decorator (`get_current_user` / `require_admin` / `require_editor`); every new external API call has `try/except` and loads keys from `settings`; no sensitive data (keys, tokens, PII) appears in logs or responses.
   - **This rule applies to every single task without exception and cannot be skipped.**
3. **When adding env vars**, update both `config.py` and `.env`.
4. **Keep services modular** — each service file has a single responsibility.
5. **All errors must be caught and logged** — never crash background workers.
6. **Auto-publish threshold is 0.5** — articles with `ai_score < 0.5` stay `pending` for editor review; articles scoring ≥ 0.5 are auto-published.
7. **Soft-delete only** — never use DELETE to remove articles or sites. Always use `PATCH status=removed` (articles) or `PATCH is_active=false` (sites) to preserve audit trail. Hard DELETE is reserved only for test data cleanup.
8. **Never drop or recreate the DB** — always use `alembic upgrade head`.
9. **Reusability first** — before writing any new component or function, search the codebase for existing similar code. Any component used in more than one place must live in `/components/` (frontend) or `/services/` (backend). Changes to shared components must be tested across all consumers.
10. **Git discipline** — commit after every completed feature or fix with a descriptive message. Format: `feat:` / `fix:` / `chore:` / `refactor:` prefix. Always run `git push` after commit. Never leave uncommitted changes at end of session.

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
STABILITY_API_KEY=sk-...
AI_REVIEW_THRESHOLD=0.5
TRENDS_AUTO_SITE_LIMIT=3
```

If you add a new env var, add it to both `app/config.py` (pydantic-settings field) and `.env`.

### API Key Cost Reference

| Key | Required | Cost model | Without key |
|-----|----------|-----------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** | $0.25/1M input + $1.25/1M output tokens (Haiku) | AI review disabled; articles stay pending indefinitely |
| `TAVILY_API_KEY` | **Yes** | ~$0.004/search (estimated) | Scraper falls back to Google CSE only |
| `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | **Yes** | Free ≤ 100 queries/day; $5/1000 thereafter | Scraper falls back to Tavily only |
| `UNSPLASH_ACCESS_KEY` | **Yes** | Free (demo key: 50 req/hour) | Articles published without images; fallbacks used |
| `STABILITY_API_KEY` | Optional | ~$0.04/image (≈ 1 credit/logo @ 1536×640) | SVG fallback logos generated offline instead |
| `SECRET_KEY` | **Yes** | Free | JWT signing broken — never omit |

All cost data is tracked in `api_usage_log` table and visible at `/admin/api-usage`.

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
      admin/            # /admin/users, /admin/analytics, /admin/images/audit,
                        #   /admin/api-usage (cost & usage dashboard)
      public/           # /public/* (unauthenticated renderer API)
    security/
      auth.py           # bcrypt hashing, JWT creation/decoding
      permissions.py    # get_current_user, require_admin, require_editor
    services/
      scraper.py        # Tavily + Google CSE → full HTML fetch → Article save
      ai_review.py      # Claude Haiku review + rewrite + scoring + translation
      image_service.py  # Unsplash API enrichment for articles missing main_image_url
      image_validator.py # HEAD-check validation + retry/fallback for article images
      logo_service.py   # Stability AI SDXL 1536×640 logo generation + SVG fallback
      trends_service.py # Google Trends RSS fetch → dedup → DB; AI site config
      usage_service.py  # log_api_call() — fire-and-forget telemetry for all 6 external APIs
    utils/
      sanitize.py       # HTML sanitizer blocking XSS / script injection
    workers/
      scrape_worker.py  # Background loop (60s): runs due scrape jobs
      review_worker.py  # Background loop (30s): AI review of pending articles
      trends_worker.py  # Background loop (5h): fetches Google Trends per region
      image_worker.py   # Startup pass + loop (6h): validates and fixes article images
```

### Frontend (`frontend/src/`)

Three micro-apps sharing one Vite build at port 5173:

| Path | Role | Auth |
|------|------|------|
| `/admin/*` | Sites, ScrapeJobs, Users management | `admin` only |
| `/cms/*` | Article & category editing | `editor` or `admin` |
| `/review/*` | Review queue | any authenticated user |

Shared infra: `AuthContext` (JWT in localStorage), `DirectionContext` (RTL/LTR), `ThemeContext` (dark/light — persisted to localStorage, falls back to `admin_theme_default` platform setting), `@tanstack/react-query` for all API calls, axios client in `src/api/client.js`.

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
- `SiteContext` — fetches site + articles + categories; derives `siteKeywords` from `site.scrape_keywords` (job keywords from API) first, then category names, tagline words, DEFAULT_KEYWORDS; exposes via context
- `utils/defaultImages.js` — `getDefaultImage(keywords, index)` cycles keywords by article ID; used as fallback when `main_image_url` is null
- All templates use `article.main_image_url || getDefaultImage(siteKeywords, article.id)` — never a broken image
- CSS custom properties for per-site brand colors, set dynamically from `site.config`
- Full RTL support: `tailwindcss-rtl` + `dir={site.text_direction}` on root element
- Pages: home (template router), `/article/:id`, `/category/:slug`, 404

### Data Model

- **User** — roles `admin | editor | viewer`, bcrypt password, JWT auth
- **Site** — `domain` (unique), `template_id` (template-a…e), `config` JSON (colors), `language` (en/he/ar/fr), auto-derived `text_direction` (RTL for he/ar)
- **Category** — scoped per site, URL `slug`
- **Article** — belongs to Site + optional Category/editor. Status: `pending → published | removed`. Key fields: `content_html` (Text), `main_image_url`, `ai_score` (0–1), `ai_flags`, `is_pinned`, `pin_order`, `pinned_until` (nullable DateTime — timed feature; public API sorts these first), `reading_time_minutes` (@property, computed), `translated_from`, all SEO fields (`seo_title`, `seo_description`, `seo_keywords`)
- **ScrapeJob** — `keywords` (JSON array), `language`, `frequency_minutes`, `category_rules`, `status`, `last_error`
- **Analytics** — page-view events per site/article, `created_at` timestamp
- **Trend** — keyword, region, language, score (rank-derived 0–1), trend_date (YYYY-MM-DD), status (`new → used | dismissed`), optional `site_id` FK when used to create a site
- **AppSetting** — key-value table for persistent feature settings. Current key: `trends_fetch_region` (ISO code or `""` for worldwide)
- **PlatformSetting** — typed key-value table for tunable runtime parameters. Fields: key (PK), value, value_type (string/float/int/bool), description, updated_by_id (FK User), updated_at. 9 seeded defaults (see settings_service.py DEFAULTS) including `admin_theme_default`
- **ApiUsageLog** — per-call telemetry for all external APIs. Fields: id, service (slug), endpoint, timestamp (indexed), success (bool), meta (JSON blob for tokens/credits/etc.). Written by `usage_service.log_api_call()` — never raises. Migration `c3d4e5f6a7b8`.

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

`services/image_service.py`: calls Unsplash Search API (`per_page=10`) to find a relevant image for new articles. Requires `UNSPLASH_ACCESS_KEY`. Accepts `excluded_urls: set[str]` to prevent assigning the same Unsplash photo to multiple articles on the same site. Normalises all CDN URLs to their stable `photo-<id>` slug before comparing (Unsplash varies `ixid`/`ixlib` params). Tries up to `_MAX_CANDIDATE_PAGES=3` pages before accepting a last-resort URL.

### Logo Service

`services/logo_service.py`: calls Stability AI SDXL (`stable-diffusion-xl-1024-v1-0`) at 1536×640 (closest valid SDXL pair to target 4:1 ratio). Returns `data:image/png;base64,...` URI stored in `site.config.logo_url`. Falls back to an offline SVG generator (initials + accent icon) when `STABILITY_API_KEY` is absent or API fails. Called by `POST /sites`, `POST /sites/{id}/regenerate-logo`, and `trends_service.create_site_from_trend()`.

---

## Backend API Reference

```
POST   /auth/register
POST   /auth/login
GET    /auth/me

GET|POST|PATCH|DELETE  /sites
GET                    /sites/stats           # per-site article counts, pin counts, job status (admin)
POST                   /sites/ai-preview      # AI-generated site config preview (admin)
POST                   /sites/{id}/ai-enrich  # fill missing tagline/about/categories via Claude (admin)
GET                    /sites/{id}/default-images  # fetch+persist 5 curated Unsplash images (admin)

GET|POST|PATCH|DELETE  /cms/articles
GET                    /cms/articles/stats
GET|POST|PATCH|DELETE  /cms/categories

GET|POST|DELETE        /scraper/jobs
POST                   /scraper/jobs/{id}/run

GET    /public/sites/{id}               # includes scrape_keywords[] from site's ScrapeJobs
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

GET        /admin/api-usage       # per-service usage + cost stats from api_usage_log (admin)

GET|PATCH  /admin/users
POST       /admin/images/audit    # scan + fix broken/missing article images (admin)
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
- Platform Settings system: `PlatformSetting` ORM model (`platform_settings` table, typed key-value with value_type/description/updated_by_id); `settings_service.py` (in-memory cache, lazy load, seed_defaults on startup); `GET /settings` + `PATCH /settings/{key}` (admin only); `Settings.jsx` panel with 5 grouped sections (AI Review/Content Quality/Scraper/Trends/Interface); all hardcoded constants in scraper.py/ai_review.py/trends_service.py/trends_worker.py replaced with `settings_service.get()` calls; auto-publish logic in ai_review.py now correctly honours both threshold and `auto_publish_enabled`
- Dark/Light mode: `ThemeContext.jsx` provides `isDark` + `toggleTheme`; persisted to `localStorage` under `admin_theme`; applies `dark` class to `<html>` for Tailwind class-based dark mode; falls back to `admin_theme_default` platform setting on first visit (result committed to localStorage immediately so remounts don't re-fetch); toggle button added to AdminLayout sidebar; `tailwind.config.js` updated with `darkMode: 'class'`; **persistence bug fixed (2026-03-15)**: API-set default now writes to localStorage; `useEffect` watching `isDark` always syncs both localStorage and DOM class; `toggleTheme` simplified to `setIsDark(prev => !prev)` (sync handled by the effect); `applyThemeClass()` also called synchronously in state initializer to prevent flash
- Architecture page v2: updated `Architecture.jsx` — live stats bar (fetches articles + sites), clickable Flow nodes (show detail card), 6-layer Architecture tab (added Platform Settings layer), security badges, full dark mode support via `useTheme()`
- `pinned_until` timed pinning: nullable `DateTime` on `Article`; Alembic migration `f6a7b8c9d0e1`; public sort: `pinned_until > now()` → `is_pinned` → chronological; `_pinned_until_active()` helper handles SQLite naive datetime; `pinned_until` in `ArticleCreate`, `ArticleUpdate`, `ArticleListResponse`
- Reading time: `@property reading_time_minutes` on `Article` ORM (strips HTML, counts words ÷ 200 wpm, min 1); exposed via Pydantic `from_attributes`; `readingTime.js` in `site-renderer/src/utils/`; shown on all `ArticleCard` variants and `ArticleDetail`
- TemplateB v2 (premium magazine): sticky scroll-aware header, hero ≥70vh with gradient + countdown badge (`PinnedCountdown` updates every 60s), spotlight 2-col row, 3-col article grid, `SiteFooter` with `site.config.about` / tagline / category links / "Powered by"
- Related articles in `ArticleDetail`: 3 articles same category → same site fallback; client-side from `useSite().articles`; rendered as `ArticleCard` grid
- SEO in `ArticleDetail`: `useEffect` sets `document.title`, upserts Open Graph + Twitter Card meta tags, injects/removes JSON-LD Article schema on mount/unmount
- AI site config enrichment: `trends_service.py` `generate_site_config()` now produces `config.about`, `config.tagline`, `config.default_category_names`; stored in `site.config` JSON column
- CMS pin management: "Pin" button in `Articles.jsx` opens `PinModal` with 1d/1w/1m duration selector (shows expiry date); `pinUntilMut` sends `PATCH` with ISO datetime; expiry badge shown in table row; "Unpin" clears both `pinned_until` and `is_pinned`
- TemplateB hero height reduced: `h-40 md:h-56` Tailwind classes (was `minHeight: 72vh`)
- `InfiniteFeed.jsx` — generic paginated feed component: `articles` + `renderItem` + `pageSize` (default 10) + `gridClassName`; IntersectionObserver auto-loads next page with 300px rootMargin; "Load more" button as manual fallback; grid and sentinel are separate DOM siblings so grid layout is unbroken. Used in TemplateB "More Stories" section (pageSize=9 for 3-col grid alignment)
- `RelatedArticles.jsx` — standalone component that reads `articles` + `categoryMap` from `useSite()` directly; uses `Number(article.id)` for safe int comparison against list; same-category priority → site fallback; renders as `ArticleCard` grid
- `Footer.jsx` — standalone footer component that reads from `useSite()`; renders on every page; `buildAboutFallback()` uses `siteKeywords` when `config.about` is empty; replaces the inline `SiteFooter` in TemplateB and is also rendered by `ArticleDetail`
- `ArticleDetail.jsx` updated: inline related-articles and footer sections replaced with `<RelatedArticles>` and `<Footer>` components; footer now appears on all `/article/:id` pages
- `SiteContext.jsx` siteKeywords enriched: builds from site name → `config.default_category_names` → loaded category names → tagline words (>4 chars) → generic `DEFAULT_KEYWORDS` fallbacks; deduped with `Set`
- `defaultImages.js` DEFAULT_KEYWORDS changed from site-specific shih-tzu terms to generic `['nature', 'landscape', 'city', 'people', 'travel']`
- **Sites admin v2 (`Sites.jsx`)**: redesigned table with stats columns — template badge (colour-coded per template), language + direction badges, article count (published/pending), active pin count (clickable opens PinnedModal), last scrape time + job status badge + error tooltip; Preview link (`http://localhost:${5173 + site.id}`) per site; inline "Run Now" button triggers `POST /scraper/jobs/{id}/run`; `getSiteStats` query with 15s refetch; `PinnedModal` fetches published articles, lists pinned ones with "Unpin" button
- **SiteModal.jsx v2**: new "Content" section with tagline (80-char text input), about (300-char textarea), default_category_names (`TagInput` component — Enter/comma adds tag, Backspace removes, × per tag); "✦ Generate with AI" button calls `POST /sites/ai-preview` and backfills tagline/about/categories/colors/template; `aiLoading` + `aiError` state
- **`services/sites.js` additions**: `getSiteStats()` → `GET /sites/stats`; `previewSiteConfig(name, language, keywords)` → `POST /sites/ai-preview`
- **`POST /sites` backend enrichment**: route changed to `async def`; if `config.about` or `config.tagline` missing, calls `generate_site_config()` (best-effort, all exceptions caught + logged); after site save, auto-creates up to 5 `Category` rows from `config.default_category_names` (slugified, skips duplicates)
- **`GET /sites/stats` backend**: aggregates article counts by status, active pin count (`is_pinned OR pinned_until > utcnow()`), and latest ScrapeJob info per site; registered before `/{site_id}` to avoid FastAPI path-param conflict
- **`POST /sites/ai-preview` backend**: async route registered before `/{site_id}`; delegates to `generate_site_config(keyword, language)`; returns `SiteConfigPreview`
- **Settings UI**: `admin_theme_default` renders as `<select>` (light/dark) instead of free-text input; controlled via `SELECT_OPTIONS` map in `Settings.jsx`; save button enabled for select-type settings
- **Architecture.jsx FlowTab v2**: `FlowStep` component wraps `Node` with `GLOW_SHADOW` box-shadow on active; Trends pipeline moved to horizontal sub-flow bar at bottom; security badges row below flow; detail card still expands below diagram on click
- **`POST /sites/{id}/ai-enrich`**: async route that fills missing tagline/about/default_category_names via Claude Haiku; auto-creates Category rows from result; requires admin; registered before `PATCH /{site_id}`
- **`GET /sites/{id}/default-images`**: builds keyword list from site name + categories + tagline; calls Unsplash for 5 images; persists to `site.config.default_images`; returns `{site_id, images}`
- **SiteModal.jsx**: yellow warning banner when editing site with missing tagline/about/categories ("Some fields are missing — would you like AI to fill them automatically?"); "Yes" calls `POST /sites/{id}/ai-enrich` then merges result into form; Default Images section shows 5 thumbnails with per-slot "Replace" button; "Fetch images" button calls `GET /sites/{id}/default-images`
- **`defaultImages.js` updated**: `getDefaultImage(keywords, index, storedImages=null)` — prefers `storedImages` (from `site.config.default_images`) over keyword-based Unsplash redirects
- **`SiteContext.jsx`**: exposes `siteDefaultImages` (from `site.config.default_images`, or null); `ArticleCard` uses it as third arg to `getDefaultImage`
- **`POST /admin/images/audit`**: scans published articles for null/noise/broken images; HEAD-checks URLs with 5s timeout; calls Unsplash image service for replacements; returns `{total_inspected, missing, noise, broken, fixed, fix_failed, details[]}`; hard limit of 200 articles per run; registered in `main.py`
- **Sites.jsx Image Audit**: "🖼 Image Audit" button in header; `auditImages()` service call; `AuditModal` shows summary stats + per-article issue list with before/after thumbnails
- **Trend-based site category creation**: `create_site_from_trend()` in `trends_service.py` now auto-creates Category rows from `config.default_category_names` after site is flushed to DB (same logic as `POST /sites` route)
- **`image_validator.py`** (`services/`): `is_valid_image_url(url)` — pattern check (noise RE) → trusted-CDN fast-path → HEAD request (5s timeout, follow_redirects=True) → validates content-type `image/*` and Content-Length > 5 KB; `validate_and_fix_article_image(article_id, current_url, keywords, site_defaults)` — retries up to 2 keyword variants via Unsplash, then falls back to `site.config.default_images`
- **`image_worker.py`** (`workers/`): background task started at startup (10s delay) and every 6 hours; scans ALL published articles ordered nulls-first; skips valid images; fixes broken/missing via `validate_and_fix_article_image`; rate-limited to 1 article/second; registered in `main.py` lifespan alongside other workers
- **`ai_review.py` image pipeline**: replaced simple `enrich_article_images` call with `validate_and_fix_article_image` — validates existing `main_image_url` first, retries with keyword variants, falls back to `site.config.default_images`; published articles never left without an image
- **`GET /sites/{id}/default-images` improved**: appends "professional photography" to each keyword before querying Unsplash; validates each result with `is_valid_image_url` before saving; retries with bare keyword then Unsplash redirect fallback
- **`POST /sites` auto-default-images**: after creating a site, if `config.default_images` is absent, fires `asyncio.create_task()` to fetch 5 curated images in the background (client not blocked)
- **`defaultImages.js` three-tier fallback**: Tier 1 = `storedImages` (site.config.default_images), Tier 2 = keyword Unsplash redirect, Tier 3 = `HARDCODED_FALLBACKS` (5 permanent `source.unsplash.com/featured/?{topic}` URLs); `getDefaultImage()` always returns a non-null string
- **Bulk image fix run**: 63 published articles scanned on 2026-03-14; 22 fixed, 39 already valid, 2 failed (no Unsplash results); image_worker will retry on next cycle
- **Image specificity overhaul** (2026-03-14):
  - `GET /public/sites/{id}` returns `scrape_keywords[]` — aggregated from site's ScrapeJob rows, deduped, order preserved; `SitePublicResponse` schema extends `SiteResponse`
  - `SiteContext.jsx` uses `site.scrape_keywords` as primary `siteKeywords` source (before category names / tagline / defaults); ensures Unsplash fallbacks are topic-specific (e.g. "bonsai tree" not "nature")
  - `image_service.py` refactored: `_fetch_unsplash(article_id, query)` private helper; `enrich_article_images(article_id, keywords: str | list[str])` — when list, tries most-specific keyword first, broadens only on no-results
  - `image_validator.py`: SVG URLs added to `_NOISE_RE` (SVGs are logos/graphics, not article photos); `validate_and_fix_article_image` simplified — passes keyword list directly to `enrich_article_images` (no more separate variant loop)
  - `image_worker.py`: loads scrape-job keywords per site; `_is_mismatched_image(url, site_kws)` detects hardcoded fallback URLs (`source.unsplash.com/featured/?`) and cross-topic animal terms; articles with valid-but-mismatched images are now replaced; uses site scrape keywords as primary Unsplash search query
  - Bulk fix re-run: SVG articles (WhatsApp1.svg) replaced with Unsplash bonsai photos; all 63 articles scanned, 2 additional fixed, 0 failed
- Logo system: `services/logo_service.py` — async `generate_logo()` calls Stability AI SDXL (`stable-diffusion-xl-1024-v1-0`) at **1536×640** (landscape 2.4:1; SDXL constraint — target was 800×200/4:1 but not a valid SDXL pair; 1536×640 is the closest valid wide-landscape ratio); prompt: "Professional content website logo, horizontal format, minimalist brand icon, {topic} theme, {primary_color} accent color, transparent background PNG, clean premium design like BBC or TechCrunch, no text, no letters, symbolic icon only, high contrast"; SVG fallback for missing key or API error; display CSS: `width:auto; max-width:200px; height:50px; object-fit:contain` everywhere (SiteBrand.jsx renderer + admin Sites table); logos regenerated for all 5 sites; White Noise Hub brand colors fixed: primary `#f5f5f5` → `#1a1a2e` (deep navy), secondary `#4a90a4` → `#e94560` (vivid red)
- Auto-categories: sites with <3 categories get 4-6 AI-generated categories via Claude Haiku; Hebrew sites get Hebrew category names with romanized slugs; Bonsai (6 cats), White Noise Hub (6 cats), Shih Tzu (5 Hebrew cats) created; tattoo site already had 5 categories
- Auto article categorization: keyword-matching assigns each published article with `category_id=null` to the best-matching site category (score = matching words in title+seo_keywords); 89 of 91 uncategorized articles assigned; `ai_review.py` now enforces category assignment for all future reviewed articles
- Scrape job editing: `PATCH /scraper/jobs/{id}` endpoint (keywords, language, frequency_minutes, category_rules); `ScrapeJobUpdate` schema with same validators as Create; `ScrapeJobModal` extended to edit mode (seeds from existing job, site field locked, submit calls `updateJob`); "Edit" button per row in `ScrapeJobs.jsx`
- Tattoo site (id=4 "Geometric small tattoo") keywords updated — all 8 keywords now include the word "tattoo" (e.g. "Minimalist Geometric tattoo")
- **Logo standards v2**: `logo_service.py` prompt updated to BBC/TechCrunch-style ("Professional content website logo, horizontal format, minimalist brand icon..."); dimensions changed from 1344×768 → 1536×640 (SDXL constraint — 800×200 target not a valid pair; 1536×640 is closest wide landscape); display CSS `max-width:200px; height:50px; object-fit:contain` in `SiteBrand.jsx` and admin `Sites.jsx`; White Noise Hub brand colors fixed `#f5f5f5` → `#1a1a2e` / `#4a90a4` → `#e94560`; all 5 site logos regenerated
- **Hero/header fix**: TemplateB `HeroSection` height `h-40 md:h-56` → `min-h-[60vh] md:min-h-[75vh]` (160px was clipping the `text-4xl`/`text-6xl` h1 headline due to `overflow-hidden + flex items-end`); Templates A/D/E headers made `sticky top-0 z-40` for consistent nav behaviour; TemplateC left as-is (tall centered blog header)
- **Image dedup** (`image_service.py`): `_fetch_unsplash_candidates()` fetches `per_page=10` and returns `list[str]`; `_unsplash_photo_key()` normalises CDN URLs to stable `photo-<hex>-<hex>` slug (Unsplash varies `ixid`/`ixlib` params across calls); `enrich_article_images()` accepts `excluded_urls: set[str]`; skips any candidate whose photo key is already in use on the same site; tries up to 3 pages before accepting last-resort URL; `validate_and_fix_article_image()` accepts and threads `excluded_urls`; `ai_review.py` collects existing site image URLs before each new article and passes as `excluded_urls` → every new article gets a unique photo
- **Bulk dedup fix** (site 1): all 19 published Shih Tzu articles now have 19 unique Unsplash photos (previously 3 photos shared across 19 articles); fix used article-specific English queries derived from Hebrew titles + seo_keywords
- **Code quality**: `import json` moved to module level in `ai_review.py` (was inside `ai_review_and_enrich()`)
- **End-of-session audit** (2026-03-14): full security + code review; Architecture.jsx updated with Stability AI, logo_service, image_validator, image_worker (Workers stat 3→4), /admin/images/audit route, sticky header + hero height notes in site renderer; REVIEW.md appended with new session findings
- **Dark mode persistence fix** (2026-03-15): `ThemeContext.jsx` — API-set default now commits to localStorage; `useEffect` watching `isDark` always syncs both DOM class and localStorage; `applyThemeClass()` called synchronously in state initializer to prevent flash; `toggleTheme` simplified
- **API Usage & Costs dashboard** (2026-03-15): `ApiUsageLog` ORM model + Alembic migration `c3d4e5f6a7b8`; `services/usage_service.py` `log_api_call()` sync helper (fire-and-forget, never raises); `GET /admin/api-usage` route aggregates per-service stats + cost estimates + 7-day sparklines; `ApiUsage.jsx` frontend with service cards, status badges, recharts sparklines, summary cost bar; services instrumented: Anthropic (token counts in meta), Unsplash, Tavily, Google CSE, Google Trends, Stability AI; nav item "API Costs 💰" added to AdminLayout
- **Admin nav reorganization** (2026-03-15): `AdminLayout.jsx` sidebar refactored from flat `NAV_ITEMS` to `NAV_SECTIONS` grouped array with 4 sections — PLATFORM (Dashboard, API Costs), CONTENT PIPELINE (Trends, Sites, Scrape Jobs, Articles ✍️→/cms/articles, Review Queue ✅→/review), PUBLISHING (Categories 🏷️→/cms/categories, Pin Management→/admin/sites), SYSTEM (Users, Architecture, Settings); cross-app links use plain `Link` (not NavLink); uppercase gray section headers rendered as dividers; old "Switch to CMS/Review" footer links removed (cross-app access now inline in nav)
- **CMS nav reorganization** (2026-03-15): `CmsLayout.jsx` sidebar refactored to `NAV_SECTIONS` with 2 sections — CONTENT (Articles ✍️, Categories 🏷️), TOOLS (Pin Management 📌→/cms/articles, Review Queue ✅→/review external); same pattern as AdminLayout
- **Review nav reorganization** (2026-03-15): `ReviewLayout.jsx` sidebar refactored to `NAV_SECTIONS` with REVIEW section — Pending Queue ✅ (NavLink /review), Published 📰 (→/cms/articles?status=published external), Removed 🗑️ (→/cms/articles?status=removed external)
- **Editor's Pick toggle in ArticleDetail** (2026-03-15): `ArticleDetail.jsx` — replaced raw "Pin" checkbox card with "Editor's Pick" sidebar card; `PinModal` component inlined (same duration picker as in Articles.jsx); when not pinned: "⭐ Set as Editor's Pick" indigo button; when pinned: amber highlight card showing "📌 Featured" + expiry date + "Unpin" button; `pinUntilMut` sends `PATCH` with both `is_pinned` and `pinned_until`; modal closes on success via `onSuccess` callback
- **Reusability refactor** (2026-03-15): extracted 5 shared items from page-level duplicates → `components/AiScoreBadge.jsx` (was in 4 files, `midThreshold` prop), `components/StatusBadge.jsx` (2 files), `components/PinModal.jsx` + exported `PIN_DURATIONS` (2 files; `pinLabel` prop), `utils/formatDate.js` (4 files; `showTime`/`showYear` opts); `apps/review/ConfirmDialog.jsx` deleted — `review/Dashboard.jsx` now imports from `components/ConfirmDialog` (z bumped to z-[60] to float above preview modal); Working Rule 9 added to CLAUDE.md; `/refactor` slash command created

### 🔲 Next Steps (priority order)

0. **API Usage dashboard — data population**: `api_usage_log` table exists and all services are instrumented; the dashboard will show zeros until new API calls are made. Run a scrape job or trigger AI review to populate data.

1. **Bulk actions in CMS** — checkboxes partially exist in `Articles.jsx` but need backend: `PATCH /cms/articles/bulk` accepting array of IDs + action (publish/remove/reassign-category).

2. **Logo upgrade: DALL-E 3 / Recraft** — Stability AI SDXL doesn't support 800×200 (4:1); the closest valid pair is 1536×640. DALL-E 3 (`dall-e-3`) accepts arbitrary sizes and returns PNG with transparency natively. Recraft v3 is another option with vector output. Both would produce proper banner-ratio logos. Swap `logo_service.py` AI call if `OPENAI_API_KEY` is available.

3. **Pin order drag-and-drop** — `is_pinned` / `pin_order` fields exist on Article; `pinned_until` timed pinning done; still need drag-and-drop ordering UI for editorial `is_pinned` / `pin_order`.

4. **InfiniteFeed for other templates** — TemplateB uses InfiniteFeed; Templates A/C/D/E still render all articles at once. Consider applying InfiniteFeed to their article lists too.

5. **Analytics enhancement** — per-article page views, per-site traffic trends, unique visitor estimation. `POST /analytics/track` is already called by the renderer; data is collected but not fully surfaced.

6. **Social media trends** — currently fetches from Google Trends RSS only. Add Twitter/X trending topics (via unofficial scrape or RapidAPI), Reddit hot posts, or TikTok trending sounds as additional trend sources.

7. **Tests** — pytest infrastructure set up, auth tests exist. Need: scraper tests, AI review tests (mocked Anthropic client), image service tests (mocked Unsplash), public API integration tests.

8. **Postgres migration** — SQLite for dev; switch `DATABASE_URL` to RDS Postgres for production. No code changes needed — Alembic handles the schema. Also add DB indexes (see REVIEW.md R4).

9. **AWS deployment** — target EC2/ECS + RDS Postgres + S3 + CloudFront. See `/deploy` slash command for checklist.

10. **Rate limiting** — `POST /analytics/track` is unauthenticated and has no rate limiting; add slowapi or nginx rate limit before production. `POST /auth/login` and `POST /auth/register` similarly unprotected. (REVIEW.md R1)

11. **DOMPurify on client** — `content_html` is sanitized server-side but rendered with `dangerouslySetInnerHTML` in both `site-renderer` and the review preview modal. Add DOMPurify as a defence-in-depth layer. (REVIEW.md R2)

12. **VITE_API_URL** — frontend `api/client.js` now reads `import.meta.env.VITE_API_URL` (falls back to `localhost:8000`). Set this in `frontend/.env.production` before any deployment.

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
| Image dedup | `excluded_urls` set + photo-ID normalisation | Unsplash returns same photo with different ixid/ixlib params; photo slug is the only stable ID |
| Logo dimensions | 1536×640 (SDXL-valid) not 800×200 (target) | Stability AI SDXL requires approved dimension pairs; 1536×640 is the closest valid wide-landscape ratio |

---

## Last Session Summary

**Date:** 2026-03-15

### What was built this session

| Feature | Files changed | Status |
|---------|--------------|--------|
| Dark mode persistence fix | `frontend/src/context/ThemeContext.jsx` | ✅ Done |
| `ApiUsageLog` ORM model | `app/models/api_usage_log.py`, `app/models/__init__.py` | ✅ Done |
| Alembic migration `c3d4e5f6a7b8` | `alembic/versions/c3d4e5f6a7b8_add_api_usage_log_table.py` | ✅ Applied |
| `usage_service.py` log helper | `app/services/usage_service.py` | ✅ Done |
| `GET /admin/api-usage` route | `app/routes/admin/api_usage.py`, `main.py` | ✅ Done |
| Service instrumentation (6 services) | `ai_review.py`, `image_service.py`, `scraper.py`, `logo_service.py`, `trends_service.py` | ✅ Done |
| `ApiUsage.jsx` frontend dashboard | `frontend/src/apps/admin/ApiUsage.jsx`, `App.jsx`, `AdminLayout.jsx` | ✅ Done |
| Admin nav reorganization | `frontend/src/apps/admin/AdminLayout.jsx` | ✅ Done |
| CMS nav reorganization | `frontend/src/apps/cms/CmsLayout.jsx` | ✅ Done |
| Review nav reorganization | `frontend/src/apps/review/ReviewLayout.jsx` | ✅ Done |
| Editor's Pick toggle | `frontend/src/apps/cms/ArticleDetail.jsx` | ✅ Done |
| Reusability refactor | `components/AiScoreBadge`, `StatusBadge`, `PinModal`, `utils/formatDate`, deleted `review/ConfirmDialog` | ✅ Done |
| Working Rule 9 + `/refactor` command | `CLAUDE.md`, `.claude/commands/refactor.md` | ✅ Done |

### Current known issues / state

- **API Usage dashboard shows zeros** until new API calls are made post-migration. Trigger a scrape job or AI review to start populating `api_usage_log`. Historical calls before this session are not backfilled.
- **Site 1 (Shih Tzu):** Article 13 ("סרגל נגישות אתר") is off-topic; may want to manually remove.
- **Logo quality:** SDXL logos at 1536×640 are reasonable. Upgrading to DALL-E 3 would give proper 4:1 banner ratio.
- **No rate limiting** on `/analytics/track`, `/auth/login`, `/auth/register` — acceptable for dev, required before production.
- **No DOMPurify** on client-side `dangerouslySetInnerHTML` — acceptable for dev, required before production.
- **5 sites** in DB: Shih Tzu (id=1, Hebrew RTL), Bonsai (id=2, English), White Noise Hub (id=3, English), Geometric small tattoo (id=4, English), Giulia Vecchio Central (id=5, English).

### Exact next steps to continue from

1. Run a scrape job to populate `api_usage_log` and verify the API Costs dashboard shows live data
2. Add Analytics page at `/admin/analytics` (currently Dashboard at `/admin` doubles as analytics — consider splitting into dedicated route, or add "Analytics 📊" nav link)
3. Add bulk CMS actions: `PATCH /cms/articles/bulk` backend endpoint + checkbox UI in `Articles.jsx`
4. Upgrade logo generation to DALL-E 3 if `OPENAI_API_KEY` is provided — change `logo_service.py` AI call; dimensions can then be true 800×200
5. Add social media trend sources (Twitter/X or Reddit) as additional inputs alongside Google Trends RSS
6. Run `alembic revision --autogenerate -m "add db indexes"` and add indexes for `articles.status`, `articles.site_id`, `analytics.site_id`, `analytics.created_at`
7. Before production: add slowapi rate limiting, DOMPurify, set `VITE_API_URL` in `frontend/.env.production`, update CORS origins in `main.py`
