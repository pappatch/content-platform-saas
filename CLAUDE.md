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
| `/check-alerts` | Fetch unread alerts, display thermometer status (🟢/🔵/🟠/🔴), grouped summary table, and fix suggestions |
| `/run-log-analysis` | Run `analyze_logs(db)` on-demand; print rule-by-rule results; insert any triggered alerts into DB |
| `/clear-alerts [level]` | Delete alerts by level (all/info/warning/critical) with confirmation guard for criticals |

**Skills** (reusable — invoke with `/skill-name`):

| Skill | Description |
|-------|-------------|
| `/code-review` | Scan changed files for quality/security issues; report by severity; auto-fix critical |
| `/doc-sync` | Sync CLAUDE.md, REVIEW.md, Architecture.jsx, and commands to match current code |
| `/image-fix [site_id]` | Fix missing/broken/duplicate/off-topic article images for a site via Unsplash |
| `/session-handoff` | End-of-session wrap-up: verify rules, ensure git clean, update Last Session Summary, print handoff block |
| `/new-project` | Set up a new project with all Claude Code standards: CLAUDE.md, REVIEW.md, .claude/ structure, initial Working Rules |

---

## Working Rules

1. **Before every task, follow `.claude/hooks/pre-task.md`** — read CLAUDE.md fully, read REVIEW.md last section, check git status, and state the task context aloud (task name, branch, last commit, relevant sections, risk level). Do not write a single line of code before completing this step.

2. **After every task, follow `.claude/hooks/post-task.md`** — the full post-task checklist covers: (1) code review on changed files (unused imports, hardcoded values, missing error handling); (2) security check (auth decorators, try/except, no keys in logs); (3) update **CLAUDE.md** (Completed, Architecture, API Reference, Data Model, Next Steps, Last Session Summary); (4) update **REVIEW.md** (append audit entry — even "No new findings"); (5) update **Architecture.jsx** — covers all 4 tabs (Flow, Architecture, Guidelines, Standards) and MUST reflect: (a) any new service or worker in Backend/Workers layers, (b) any new model in the DB layer, (c) any new page or component in the Frontend layer, (d) any new slash command in the Guidelines tab, (e) any new security measure in the Security layer — **this is not optional; if Architecture.jsx is not updated the task is not complete**; (6) update **`.claude/commands/`** if a new CLI workflow was added or an existing command's API signature changed; (7) if universal standards changed (new rule, new skill, new hook procedure): also update **`~/.claude/CLAUDE.md`** and the relevant **`~/.claude/commands/`** file. Use `/code-review` and `/doc-sync` skills to fulfil these steps. **This rule applies to every single task without exception.** For every new service or worker added: (a) add at least one alert rule to `log_analyzer.py` covering its main failure mode; (b) declare `logger = logging.getLogger(__name__)` and use `logger.exception()` for all errors so `InMemoryLogHandler` captures them; (c) instrument with `usage_service.log_api_call()` if it calls any external API.

3. **When adding env vars** — add the key to both `app/config.py` (pydantic-settings field with type and default) and `backend/.env`. Document the new key in the **Environment section** of this file with its required/optional status and cost model. Never hardcode a key value in source code.

4. **Keep services modular** — one responsibility per service file. Never mix DB access, business logic, and external API calls in a single function. If a file exceeds ~300 lines, split it by responsibility. Every service and worker must declare `logger = logging.getLogger(__name__)` at module level — no module-level `print()` calls.

5. **All errors must be caught and logged** — use `logger.exception(msg)` (not `logger.error()`, not `print()`) for all error paths so the full traceback is captured by `InMemoryLogHandler`. Background worker inner loops must be wrapped in `try/except Exception as e: logger.exception(...)`. Never silently swallow exceptions — if you catch one without re-raising, you must log it.

6. **Auto-publish threshold is 0.5** — articles with `ai_score < 0.5` stay `pending` for editor review; articles scoring ≥ 0.5 are auto-published when `auto_publish_enabled=true`. Both values are PlatformSettings — never hardcode them. If you change the threshold logic, update `ai_review.py` and verify the setting is read from `settings_service.get()`.

7. **Soft-delete only** — never use DELETE to remove articles or sites. Use `PATCH status=removed` (articles) or `PATCH is_active=false` (sites) to preserve audit trail. Hard DELETE is reserved for operational records only (alerts, api_usage_log) and test data cleanup — never for content.

8. **Never drop or recreate the DB** — always use `alembic upgrade head`. Never call `create_all()` or `drop_all()` in any production code path. After any model change: (a) import the model in `alembic/env.py`, (b) run `alembic revision --autogenerate -m "description"`, (c) review the generated migration for correctness, (d) commit the migration file alongside the model change in the same commit.

9. **Reusability first** — before writing any new component or function, search the codebase for existing similar code (`Grep` or `Glob` first). Any component or utility used in 2+ places must live in `components/` (frontend) or `services/` (backend). Changes to shared code must be verified across all consumers. Run `/refactor` if duplication is suspected.

10. **Git discipline** — commit after every completed feature or fix with a descriptive message. Format: `feat:` / `fix:` / `chore:` / `refactor:` / `docs:` / `security:` prefix. Always run `git push` after commit. Never leave uncommitted changes at end of session. **Before every commit, follow `.claude/hooks/pre-commit.md`** — no hardcoded API keys, no empty files, no broken imports, all new routes have auth decorators, all new external API calls have try/except, Alembic migration exists for any model changes, CLAUDE.md and REVIEW.md are updated.

11. **Configuration discipline** — any value that affects business logic, cost, or content quality must live in PlatformSettings (runtime-editable via Settings UI). Infrastructure safety constants (timeouts, max body size, rate limits) stay as code constants. To add a new setting: add a key to `settings_service.py DEFAULTS` with `value_type` and `description`, then add a UI control in the relevant group in `Settings.jsx`. Never add new hardcoded business logic values without first checking if they belong in PlatformSettings.

12. **No empty files** — never create documentation files, directories, or placeholder files without content. If a file is created it must have real, working content immediately. Empty `DOCS/` directories, stub components, and TODO-only files are forbidden.

13. **Available skills** — use these reusable skills instead of writing ad-hoc instructions. Invoke with `/skill-name` in any Claude Code session:
    - `/code-review` — scan changed files for unused imports, hardcoded values, N+1 queries, missing error handling; report by severity (critical/warning/info); auto-fix critical issues
    - `/doc-sync` — sync CLAUDE.md (completed, architecture, API reference), REVIEW.md (append findings), Architecture.jsx (all 4 tabs), and `.claude/commands/` (updated descriptions)
    - `/image-fix [site_id]` — scan all published articles for missing/broken/duplicate/off-topic images; fix using site scrape keywords via Unsplash; report fixed/skipped/failed
    - `/session-handoff` — update "Last Session Summary" in CLAUDE.md, verify all Working Rules are current, verify git is clean, print a "Ready for next session" block that a new Claude instance can read and immediately continue from

---

## Feature Checklist

Every new feature must complete **all** items before the task is considered done. If any item is unchecked, the task is **not complete**.

**Backend**
- [ ] Model created; imported in `alembic/env.py`; `alembic revision --autogenerate` run; migration file reviewed and committed alongside model
- [ ] Routes created with the correct auth dependency (`require_admin` / `require_editor` / `get_current_user`) declared before any business logic — never after
- [ ] Service declares `logger = logging.getLogger(__name__)` at module level; all error paths use `logger.exception()` not `logger.error()` or `print()`
- [ ] Alert rule added to `log_analyzer.py` covering the service's main failure mode (required if the service can fail independently or calls an external API)
- [ ] `usage_service.log_api_call(service, endpoint, success, meta)` instrumented at every external API call site
- [ ] Pydantic schemas created for all request/response types; no raw `dict` passed between route and service

**Frontend**
- [ ] Component placed in `components/` if it will be used in 2 or more places
- [ ] Route added to `App.jsx` with correct lazy import and auth guard
- [ ] Nav item added to the relevant layout sidebar (`AdminLayout`, `CmsLayout`, or `ReviewLayout`)
- [ ] Any new admin layout header includes `<AlertControls />` (see Admin UI Standard)
- [ ] React Query cache keys defined; mutations invalidate all affected query keys

**Documentation**
- [ ] CLAUDE.md updated: Completed section, Architecture section, API Reference (new routes), Data Model (new models), Next Steps (if new item identified)
- [ ] REVIEW.md updated with session audit entry (even "No new findings — audit date: YYYY-MM-DD")
- [ ] Architecture.jsx updated — all 4 tabs checked: Flow (new pipeline steps), Architecture (new layers/services), Guidelines (new commands), Standards (new rules)
- [ ] `.claude/commands/` updated or new command created if a new repeatable CLI workflow was introduced
- [ ] If a universal standard changed: `~/.claude/CLAUDE.md` and the relevant `~/.claude/commands/` file updated

**Configuration & Quality**
- [ ] Any new runtime-configurable value added to `settings_service.py DEFAULTS` + `Settings.jsx` UI group
- [ ] Pre-commit checklist passed (`.claude/hooks/pre-commit.md`): no secrets, no unused imports, no `console.log`, no broken imports
- [ ] All new routes tested manually (or via `pytest`); error paths verified to return correct HTTP status codes

**Git**
- [ ] Committed with `feat:` / `fix:` / `chore:` / `refactor:` prefix and descriptive message
- [ ] `git push` completed; branch is clean

---

## Global Claude Code Configuration (`~/.claude/`)

Universal Claude Code standards that apply to every project, not just this one.
See the **📐 Standards** tab in the Architecture page for an interactive browser.

```
~/.claude/
  CLAUDE.md                     # Universal Working Rules + code quality + security + health standards
  hooks/
    pre-task.md                 # Generic pre-task checklist (read context, git status, risk level)
    post-task.md                # Generic post-task checklist (code review, docs, commit)
    pre-commit.md               # Generic pre-commit safety checks (secrets, auth, migrations)
  skills/
    code-review.md              # Python + JS/JSX quality checklist with auto-fix table
    doc-sync.md                 # 6-step sync: CLAUDE.md → REVIEW.md → Architecture → commands
    image-fix.md                # Article image scan, classify, and fix procedure
    session-handoff.md          # End-of-session wrap-up and handoff block template
  commands/
    pre-task.md                 # Thin wrapper → hooks/pre-task.md
    post-task.md                # Thin wrapper → hooks/post-task.md
    pre-commit.md               # Thin wrapper → hooks/pre-commit.md
    code-review.md              # Thin wrapper → skills/code-review.md
    doc-sync.md                 # Thin wrapper → skills/doc-sync.md
    image-fix.md                # Thin wrapper → skills/image-fix.md
    session-handoff.md          # Thin wrapper → skills/session-handoff.md
    new-project.md              # Full 9-step wizard for new project scaffold
    check-alerts.md             # Fetch + display unread alerts, thermometer status, fix suggestions
    run-log-analysis.md         # Run analyze_logs(db) on-demand; print rule results; insert alerts
    clear-alerts.md             # Delete alerts by level (all/info/warning/critical) with confirm guard
```

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
                        #   /admin/alerts (CRUD + bulk delete)
                        #   /admin/docs/{filename|project/|global/} (doc viewer)
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
      log_analyzer.py   # DB-based ALERT_RULES (articles stuck pending, scrape job failed, api_usage_log error rates) + log-buffer fallback for DB-down
      settings_service.py # In-memory cache for PlatformSettings; seed_defaults on startup
    utils/
      sanitize.py       # HTML sanitizer blocking XSS / script injection
    workers/
      scrape_worker.py  # Background loop (interval from PlatformSettings): runs due scrape jobs
      review_worker.py  # Background loop (interval from PlatformSettings): AI review of pending articles
      trends_worker.py  # Background loop (5h): fetches Google Trends per region
      image_worker.py   # Startup pass + loop (interval from PlatformSettings): validates and fixes article images
      alert_worker.py   # Background loop (5m): runs analyze_logs() → inserts Alert rows; hosts InMemoryLogHandler
```

### Frontend (`frontend/src/`)

Three micro-apps sharing one Vite build at port 5173:

| Path | Role | Auth |
|------|------|------|
| `/admin/*` | Sites, ScrapeJobs, Users management | `admin` only |
| `/cms/*` | Article & category editing | `editor` or `admin` |
| `/review/*` | Review queue | any authenticated user |

Shared infra: `AuthContext` (JWT in localStorage), `DirectionContext` (RTL/LTR), `ThemeContext` (dark/light — persisted to localStorage, falls back to `admin_theme_default` platform setting), `@tanstack/react-query` for all API calls, axios client in `src/api/client.js`.

All three layouts include `<AlertControls />` (HealthThermometer + AlertBell) in the header — see Admin UI Standard.

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
- `utils/defaultImages.js` — `getDefaultImage(keywords, index, storedImages)` prefers `site.config.default_images`; returns `null` if none set (callers render `--color-primary` placeholder)
- CSS custom properties for per-site brand colors, set dynamically from `site.config`
- Full RTL support: `tailwindcss-rtl` + `dir={site.text_direction}` on root element
- Pages: home (template router), `/article/:id`, `/category/:slug`, 404

### Data Model

- **User** — roles `admin | editor | viewer`, bcrypt password, JWT auth
- **Site** — `domain` (unique), `template_id` (template-a…e), `config` JSON (colors, logo_url, about, tagline, default_images, default_category_names), `language` (en/he/ar/fr), auto-derived `text_direction` (RTL for he/ar)
- **Category** — scoped per site, URL `slug`
- **Article** — belongs to Site + optional Category/editor. Status: `pending → published | removed`. Key fields: `content_html` (Text), `main_image_url`, `ai_score` (0–1), `ai_flags`, `is_pinned`, `pin_order`, `pinned_until` (nullable DateTime — timed feature; public API sorts these first), `reading_time_minutes` (@property, computed), `translated_from`, all SEO fields (`seo_title`, `seo_description`, `seo_keywords`)
- **ScrapeJob** — `keywords` (JSON array), `language`, `frequency_minutes`, `category_rules`, `status`, `last_error`
- **Analytics** — page-view events per site/article, `created_at` timestamp
- **Trend** — keyword, region, language, score (rank-derived 0–1), trend_date (YYYY-MM-DD), status (`new → used | dismissed`), optional `site_id` FK when used to create a site
- **AppSetting** — key-value table for persistent feature settings. Current key: `trends_fetch_region` (ISO code or `""` for worldwide)
- **PlatformSetting** — typed key-value table for tunable runtime parameters. Fields: key (PK), value, value_type (string/float/int/bool), description, updated_by_id (FK User), updated_at. 22 seeded defaults in `settings_service.py DEFAULTS`: `ai_review_threshold`, `auto_publish_enabled`, `max_searches_per_job`, `min_paragraph_blocks`, `min_word_count`, `trends_fetch_interval_hours`, `trends_auto_site_limit`, `trends_auto_site_threshold`, `admin_theme_default`, `scraper_tavily_max_results`, `scraper_google_max_results`, `blocked_scrape_domains`, `scrape_worker_interval_seconds`, `ai_review_input_char_limit`, `ai_review_max_tokens`, `default_images_per_site`, `image_max_candidate_pages`, `image_worker_interval_hours`, `image_audit_max_articles`, `trends_per_region`, `trends_default_scrape_frequency_minutes`, `review_worker_interval_seconds`
- **ApiUsageLog** — per-call telemetry for all external APIs. Fields: id, service (slug), endpoint, timestamp (indexed), success (bool), meta (JSON blob for tokens/credits/etc.). Written by `usage_service.log_api_call()` — never raises. Migration `c3d4e5f6a7b8`.
- **Alert** — system alert generated by log analyzer. Fields: id, level (critical/warning/info, indexed), title, message, source (indexed), is_read (bool, indexed), created_at (indexed), resolved_at (nullable). Migration `e2f3a4b5c6d7`. Hard-delete is acceptable (operational records, not content).

### Auth Flow

JWT issued at `/auth/login`. Claim `sub` = user ID (string), `role` = role value. Use `get_current_user` for protected routes, `require_admin` / `require_editor` for role-gated routes.

### Scraper Engine

`services/scraper.py`: keyword searches via Tavily (primary, provides `ai_score`) + Google CSE (secondary), deduplicates by URL (Tavily score wins), fetches full HTML via httpx with SSRF protection, saves new Articles. Max results from PlatformSettings (`scraper_tavily_max_results`, `scraper_google_max_results`).

- SSRF protection: scheme whitelist, RFC-1918 IP blocking, link-local/ULA IPv6 blocking
- Domain blocklist: `blocked_scrape_domains` PlatformSetting (7 social domains by default)
- Per-domain rate limiting (2s), max 5MB download, 15s timeout
- HTML parser extracts semantic blocks → `content_html`
- Quality gates: ≥3 paragraphs, ≥100 words (`min_paragraph_blocks`, `min_word_count` PlatformSettings)

### AI Review Engine

`services/ai_review.py`: single Anthropic API call using `tool_use` + `tool_choice="tool"` for structured JSON.

- Model: `claude-haiku-4-5-20251001`, max tokens from `ai_review_max_tokens` platform setting (default 4096), input truncated to `ai_review_input_char_limit` chars (default 8000)
- Produces: rewritten `content_html`, `title`, `score` (0–1), `flags[]`, `seo_title`, `seo_description`, `seo_keywords`
- Auto-detects source language; translates if source ≠ site language; sets `translated_from`
- RTL-aware prompt hints for Hebrew / Arabic
- After scoring: calls `validate_and_fix_article_image()` to ensure image is present and valid
- On any error: article stays `pending` (safe to retry)

### Image Service

`services/image_service.py`: calls Unsplash Search API (`per_page=10`) to find a relevant image for new articles. Requires `UNSPLASH_ACCESS_KEY`. Accepts `excluded_urls: set[str]` to prevent assigning the same Unsplash photo to multiple articles on the same site. Normalises all CDN URLs to their stable `photo-<id>` slug before comparing (Unsplash varies `ixid`/`ixlib` params). Tries up to `image_max_candidate_pages` platform setting (default 3) pages before accepting a last-resort URL.

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
PATCH                  /sites/{id}/default-images  # save curated list of up to 5 URLs (admin)
POST                   /sites/{id}/default-images/fill  # fill empty slots via Unsplash (admin)
DELETE                 /sites/{id}/default-images/{index}  # remove one slot, auto-fill replacement (admin)

GET|POST|PATCH|DELETE  /cms/articles
PATCH                  /cms/articles/bulk     # bulk action: publish|remove|reassign-category (editor+)
GET                    /cms/articles/stats
GET|POST|PATCH|DELETE  /cms/categories

GET|POST|DELETE        /scraper/jobs
PATCH                  /scraper/jobs/{id}     # update keywords, frequency, language, category_rules
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
GET        /admin/docs/{filename} # serve CLAUDE.md or REVIEW.md content (admin; strict allowlist)
GET        /admin/docs/project/{filepath:path}  # serve .claude/ project files (admin; allowlist)
GET        /admin/docs/global/{filepath:path}   # serve ~/.claude/ global files (admin; allowlist)

GET|PATCH  /admin/users
POST       /admin/images/audit    # scan + fix broken/missing article images (admin)

GET        /admin/alerts                   # list alerts with unread count (admin; filters: level, is_read)
POST       /admin/alerts/test              # create a test critical alert to verify UI flow (admin)
PATCH      /admin/alerts/read-all          # mark all unread alerts as read (admin)
PATCH      /admin/alerts/{id}/read         # mark one alert as read (admin)
DELETE     /admin/alerts/bulk              # bulk hard-delete by ID list (admin; body: {ids:[int]})
DELETE     /admin/alerts/all               # delete all alerts, optional ?level=critical|warning|info (admin)
DELETE     /admin/alerts/{id}              # hard-delete one alert (admin)

POST       /analytics/track
GET        /analytics
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
SERPAPI_KEY=
AI_REVIEW_THRESHOLD=0.5
TRENDS_AUTO_SITE_LIMIT=3
```

If you add a new env var: add it to both `app/config.py` (pydantic-settings field) and `.env`, then document it in the table below.

### API Key Cost Reference

| Key | Required | Cost model | Without key |
|-----|----------|-----------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** | $0.25/1M input + $1.25/1M output tokens (Haiku) | AI review disabled; articles stay pending indefinitely |
| `TAVILY_API_KEY` | **Yes** | ~$0.004/search (estimated) | Scraper falls back to Google CSE only |
| `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` | **Yes** | Free ≤ 100 queries/day; $5/1000 thereafter | Scraper falls back to Tavily only |
| `UNSPLASH_ACCESS_KEY` | **Yes** | Free (demo key: 50 req/hour) | Articles published without images; fallbacks used |
| `STABILITY_API_KEY` | Optional | ~$0.04/image (≈ 1 credit/logo @ 1536×640) | SVG fallback logos generated offline instead |
| `SERPAPI_KEY` | Optional | Free tier: 100 searches/month (serpapi.com, no credit card) | Trends Explore + Trending Now fall back to pytrends / RSS |
| `SECRET_KEY` | **Yes** | Free | JWT signing broken — never omit |

All cost data is tracked in `api_usage_log` table and visible at `/admin/api-usage`.

---

## Current Sites (DB)

| ID | Name | Template | Language | Direction | Notes |
|----|------|----------|----------|-----------|-------|
| 1  | Shih Tzu (Hebrew) | template-b | Hebrew | RTL | Active scrape job |
| 2  | Bonsai | template-b | English | LTR | Active scrape job |
| 3  | White Noise Hub | template-b | English | LTR | Active |
| 4  | Geometric Tattoo | template-b | English | LTR | Active |
| 5  | Giulia Vecchio Central | template-b | English | LTR | Active |

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
- Image service: Unsplash API enrichment post-AI-review; dedup via photo-slug normalisation; up to 3 pages per query
- All backend API routes working
- Admin frontend: Sites CRUD, ScrapeJobs (run/delete/create/edit), Users management, Architecture reference page
- CMS Articles: list + filters (site/status/AI score/date), TipTap rich editor, SEO fields
- CMS Categories: list, create, edit, delete (slug validation)
- Review Queue: list, filters, sort, 30s refresh, approve/reject, full preview modal
- Analytics Dashboard: stat cards, stacked bar chart, AI score histogram, page views line chart
- Site renderer: all 5 templates (A–E), RTL support, per-site theming, default image fallbacks
- Google Trends feature: `Trend` model, `trends_service.py`, `trends_worker.py` (5h), `/trends` routes, `Trends.jsx`
- Trends region selector: `AppSetting` persists `trends_fetch_region`; grouped region catalogue; region dropdown
- Trends Explore tab: pytrends integration; recharts LineChart + BarChart; related queries; Create Site modal
- Architecture page v3: 4-tab React+Tailwind page (Flow, Architecture, Guidelines, Standards); live stats bar; clickable security badges; Standards tab with global/project config browser + working rules + health standard
- Platform Settings system: 22 seeded `PlatformSetting` defaults; in-memory cache; `GET/PATCH /settings`; 6-group `Settings.jsx` UI; all hardcoded business logic constants replaced
- Dark/Light mode: `ThemeContext.jsx`; persisted to localStorage; falls back to `admin_theme_default` platform setting; no flash on load; `setTheme(value)` exposed so Settings page can apply + preview without toggling
- **Theme sync in Settings** (2026-04-15): `Settings.jsx` now calls `setTheme(value)` on select change (live preview), on save success (confirm + persist to localStorage), and reverts preview on unmount if save was not completed
- **Logo topic fix v1** (2026-06-03): `logo_service._build_topic()` prefers ASCII-rich keywords over Hebrew/RTL ones
- **Logo topic fix v2** (2026-06-03): `_build_topic()` now scores and ranks ASCII keywords — `_score_keyword()` awards +3 pure-ASCII (`str.isascii()`), +2 length 3–20, +1 strong brand term (`_STRONG_BRAND_TERMS` frozenset); top 2 chosen; site 9 now yields `world cup, fifa` instead of `mondial, mondial 2026`
- **Scrape worker inactive-site guard** (2026-06-03): `scrape_worker._run_due_jobs()` now checks `job.site.is_active` before calling `scrape_and_save`; inactive sites are skipped with an INFO log and never counted as failed
- `pinned_until` timed pinning: nullable DateTime on Article; public API sorts pinned-until-active first; `PinModal` with 1d/1w/1m picker; expiry badge in CMS table
- Reading time: `@property reading_time_minutes`; shown on all ArticleCard variants and ArticleDetail
- TemplateB v2: sticky header; hero ≥60vh; `InfiniteFeed` for "More Stories"; `RelatedArticles` component; `Footer` component
- SEO in ArticleDetail: Open Graph + Twitter Card meta tags; JSON-LD Article schema injected/removed on mount/unmount
- AI site config enrichment: `generate_site_config()` produces about/tagline/category names; stored in `site.config` JSON
- SiteModal v2: tagline/about/categories + AI-generate button; Default Images 5-slot manager (per-slot Replace/Set URL/Remove; Auto-fill; Refresh all)
- Logo system: Stability AI SDXL 1536×640; SVG fallback; `logo_service.py`; display CSS `max-width:200px; height:50px`
- Auto-categories and auto-article-categorisation: `ai_review.py` enforces category assignment for all future articles
- Shared components: `AiScoreBadge`, `StatusBadge`, `PinModal`, `ConfirmDialog`; `utils/formatDate.js`
- API Usage & Costs dashboard: `ApiUsageLog` model + migration `c3d4e5f6a7b8`; `usage_service.py`; `ApiUsage.jsx` with sparklines; all 6 services instrumented
- Nav reorganization: `NAV_SECTIONS` grouped structure in AdminLayout, CmsLayout, ReviewLayout
- Editor's Pick toggle in ArticleDetail: amber highlight when pinned; inline PinModal; expiry display
- `blocked_scrape_domains` PlatformSetting: 7 social domains blocked by default; subdomain-aware check in scraper
- Automation layer: `.claude/hooks/` (pre-task, post-task, pre-commit); `.claude/skills/` (code-review, doc-sync, image-fix, session-handoff); `~/.claude/` global equivalents
- Architecture Standards tab: global + project config browser; 13 working rules colour-coded; 9-step new-project checklist; Health & Alerting Standard section
- Alert system: `Alert` model + migration `e2f3a4b5c6d7`; DB-based `log_analyzer.py` (7 ALERT_RULES); `alert_worker.py` (5m loop + `InMemoryLogHandler`); `/admin/alerts` CRUD routes including `POST /test` and bulk delete
- HealthThermometer + AlertBell + AlertControls: integrated into AdminLayout, CmsLayout, ReviewLayout headers
- Alert management slash commands: `/check-alerts`, `/run-log-analysis`, `/clear-alerts` in both `.claude/commands/` and `~/.claude/commands/`
- Working Rules 2, 3, 4, 5 clarified; Feature Checklist added; section order improved (2026-03-18)
- **Bulk actions in CMS** (2026-03-18): `PATCH /cms/articles/bulk` endpoint — atomic transaction, `BulkArticleRequest` schema (ids, action: publish|remove|reassign-category, category_id), `BulkActionResult` response (updated/failed/errors); `require_editor` auth; category-site mismatch counted as failed. `Articles.jsx` sticky `BulkToolbar` component with Publish/Remove/Assign Category (dropdown picker) / Clear; indeterminate checkbox in header; selected-row highlight; `Toast` component for success/error feedback; `bulkUpdateArticles()` added to `services/articles.js`
- **Google Trends rate-limit hardening** (2026-04-13): `trends_service.py` — `_is_rate_limit_error()` helper (detects `TooManyRequestsError`, `requests.HTTPError` 429, and "429" string fallback); `_explore_keyword_sync` wraps all pytrends calls in 3-attempt exponential-backoff retry (2/4/8s delays); random 1–3s human-like jitter before each attempt; raises `ValueError("Google Trends is temporarily unavailable — try again in a few minutes")` after exhausted retries; `retries=0` on `TrendReq` to avoid double-retry. `routes/trends.py` — `explore_keyword_route` catches `ValueError` separately to forward the clear message verbatim; fallback handler upgraded from `logger.error` to `logger.exception`.
- **SerpAPI integration for Google Trends** (2026-04-13): `trends_service.py` — `_serpapi_explore_keyword_sync()` (single HTTP call to `engine=google_trends`, parses interest_over_time/top_countries/related_queries from JSON, `log_api_call("serpapi",...)` telemetry, 429→clear ValueError); `_serpapi_fetch_trending_sync()` (single call to `engine=google_trends_trending_now`, traffic-score via `_parse_traffic_score`); `explore_keyword()` dispatches to SerpAPI when SERPAPI_KEY set, pytrends fallback with warning otherwise; `fetch_and_store_trends()` dispatches to SerpAPI when SERPAPI_KEY + specific geo set, RSS fallback for worldwide or no key. `config.py` — `serpapi_key: Optional[str] = None`. `SERPAPI_KEY=` added to `.env`.

---

## Next Steps

Priority order for upcoming sessions:

0. **Alert system verification** — run `alembic upgrade head` (migration `e2f3a4b5c6d7`), restart backend, open admin → click thermometer → `POST /admin/alerts/test` → confirm bell badge, dropdown, and Alerts page all update; delete test alert via "Delete all" in bell dropdown.

1. ~~**Bulk actions in CMS**~~ ✅ Done — `PATCH /cms/articles/bulk` (publish/remove/reassign-category); sticky bulk toolbar in Articles.jsx with Publish/Remove/Assign Category/Clear; toast feedback.

2. **DB indexes** — `alembic revision --autogenerate -m "add db indexes"` then manually add: `articles.status`, `articles.site_id`, `analytics.site_id`, `analytics.created_at`. (REVIEW.md R4)

3. **API Usage dashboard — data population** — `api_usage_log` table is empty until new API calls are made. Run a scrape job or trigger AI review to populate data.

4. **Logo upgrade: DALL-E 3 / Recraft** — DALL-E 3 accepts arbitrary sizes (true 800×200 possible). Swap `logo_service.py` AI call if `OPENAI_API_KEY` is available.

5. **Pin order drag-and-drop** — `is_pinned` / `pin_order` fields exist; `pinned_until` timed pinning done; need drag-and-drop ordering UI.

6. **InfiniteFeed for other templates** — TemplateB uses InfiniteFeed; Templates A/C/D/E still render all articles at once.

7. **Analytics enhancement** — per-article page views, per-site traffic trends, unique visitor estimation.

8. **Social media trends** — add Twitter/X, Reddit, or TikTok as additional trend sources.

9. **Tests** — need: scraper tests, AI review tests (mocked Anthropic client), image service tests (mocked Unsplash), public API integration tests.

10. **Postgres migration** — switch `DATABASE_URL` to RDS Postgres for production; add DB indexes (REVIEW.md R4).

11. **Production hardening** — slowapi rate limiting on auth + analytics routes (REVIEW.md R1); DOMPurify on `dangerouslySetInnerHTML` (REVIEW.md R2); `VITE_API_URL` in `frontend/.env.production`; update CORS origins in `main.py` (REVIEW.md R3).

---

## AWS Deployment (Planned)

- Not started as of March 2026
- Target: EC2 / ECS / Elastic Beanstalk (TBD)
- Database: RDS Postgres — just update `DATABASE_URL` in `.env`
- Static assets / renderer builds: S3 + CloudFront
- Each site renderer is a separate Vite build with `VITE_SITE_ID` baked in

---

## Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Content storage | Single `content_html` Text field | Simpler than block model; AI rewrites full HTML |
| AI model | Claude Haiku (`claude-haiku-4-5-20251001`) | Cheap, fast, structured via `tool_use` |
| Auto-publish threshold | 0.5 (PlatformSetting) | Below → stays pending for human review |
| Reject action | `PATCH status=removed` | Soft delete preserves audit trail |
| Default images | `site.config.default_images` (5 curated Unsplash photos) | Specific, high-quality; falls back to `--color-primary` placeholder |
| Image dedup | `excluded_urls` set + photo-ID normalisation | Unsplash varies `ixid`/`ixlib` params; photo slug is the only stable ID |
| Site renderer | Separate Vite app per site | Clean isolation; `VITE_SITE_ID` selects site at build time |
| RTL support | `dir={site.text_direction}` on root + `tailwindcss-rtl` | Covers all templates and components automatically |
| Trends score | `1.0 - rank * 0.09` (rank 0–9) | Simple deterministic score; pytrends doesn't expose raw volume |
| Trends dedup | `(keyword, trend_date)` unique pair | Same keyword on a new day is a new row; UI shows "Seen before" badge |
| Auto-site limit | `TRENDS_AUTO_SITE_LIMIT=3` in PlatformSettings | Prevents uncontrolled site sprawl; enforced server-side |
| Trend regions | US, GB, IL, FR, SA → en/en/he/fr/ar | Covers all 4 supported site languages |
| Logo dimensions | 1536×640 (SDXL-valid) not 800×200 (target) | Stability AI SDXL requires approved dimension pairs |
| Alert rules | DB queries (`check: "db"` / `check: "api_log"`) not log-file regex | DB state is authoritative; log-pattern rules are last resort (DB-down only) |
| Worker intervals | All from PlatformSettings | Admin can tune without restart; no hardcoded sleep values in workers |

---

## Project History

### Critical Issues Fixed (March 2026)

Full audit conducted by Claude Code (claude-sonnet-4-6). See `REVIEW.md` for complete findings.

| Issue | File | Fix |
|-------|------|-----|
| Self-registration privilege escalation | `app/routes/auth.py` | `register` now forces `role=viewer` regardless of request body |
| `connect_args` Postgres incompatibility | `app/database.py` | Only applied when DATABASE_URL starts with `sqlite` |
| Weak HTML sanitizer (missing svg/math/meta/template/srcdoc) | `app/utils/sanitize.py` | Added to denylist; improved comments |
| Hardcoded `localhost:8000` in frontend | `frontend/src/api/client.js` | Now reads `VITE_API_URL` env var with localhost fallback |

### Security Invariants Confirmed (March 2026)

- JWT `none` algorithm: SAFE — `decode_access_token` pins `algorithms=[settings.algorithm]`
- API keys: SAFE — all read from `Settings` (env vars); none hardcoded
- SSRF: SAFE — `validate_url()` resolves hostname and blocks RFC-1918/loopback/link-local
- SQL injection: SAFE — all queries use SQLAlchemy ORM (parameterised)
- CORS: SAFE — locked to localhost ports (dev); update for production
- Auth on routes: SAFE — all non-public routes require `get_current_user` or higher

---

## Last Session Summary

**Date:** 2026-06-03

### What was built this session

| Feature | Files changed | Status |
|---------|--------------|--------|
| Logo topic fix — prefer ASCII keywords for non-English sites | `backend/app/services/logo_service.py` — `_build_topic()` now filters for ASCII-containing keywords first; falls back to original `[:2]` slice only if no ASCII keywords exist | ✅ Done |

### Current known issues / state

- **Stability AI regenerated AI PNGs** for sites 8 and 9 — balance was topped up; both now have `data:image/png` logos with correct topic prompts.
- **Alert system workers not yet running** — alerts table needs `alembic upgrade head` (migration `e2f3a4b5c6d7`) first. After migration, worker starts automatically on backend restart.
- **API Usage dashboard shows zeros** — `api_usage_log` table is empty until new API calls are made. Run a scrape job or trigger AI review to start populating it.
- **Sites without `default_images`** will show coloured `--color-primary` placeholders. Run `/image-fix [site_id]` after populating default images via admin Site modal → "✦ Auto-fill empty".
- **Hook enforcement is manual** — `.claude/hooks/` are instruction documents, not shell hooks. See REVIEW.md R19.

### Exact next steps to continue from

1. Run `alembic upgrade head` to apply migration `e2f3a4b5c6d7` (alerts table), restart backend
2. Open admin → click thermometer → `POST /admin/alerts/test` → confirm full UI flow (bell badge, dropdown, Alerts page)
3. Delete test alert via "Delete all" in bell dropdown
4. **DB indexes** — `alembic revision --autogenerate -m "add db indexes"` then manually add: `articles.status`, `articles.site_id`, `analytics.site_id`, `analytics.created_at` (REVIEW.md R4)
5. Run a scrape job → confirm API Costs dashboard shows live data
6. At end of each session, invoke `/session-handoff` to keep this summary current
