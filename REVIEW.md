# Security & Quality Code Audit

**Date:** March 14, 2026
**Auditor:** Claude Code (claude-sonnet-4-6)
**Scope:** Full codebase — backend, frontend, site-renderer

---

## Files Scanned

### Backend
- `backend/main.py`
- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/models/__init__.py`
- `backend/app/models/article.py`
- `backend/app/models/article_block.py`
- `backend/app/models/user.py`
- `backend/app/models/site.py`
- `backend/app/schemas/article.py`
- `backend/app/schemas/user.py`
- `backend/app/schemas/analytics.py`
- `backend/app/routes/auth.py`
- `backend/app/routes/sites/sites.py`
- `backend/app/routes/cms/articles.py`
- `backend/app/routes/cms/categories.py`
- `backend/app/routes/public/public.py`
- `backend/app/routes/admin/users.py`
- `backend/app/routes/admin/analytics.py`
- `backend/app/routes/scraper/jobs.py`
- `backend/app/security/auth.py`
- `backend/app/security/permissions.py`
- `backend/app/services/ai_review.py`
- `backend/app/services/scraper.py`
- `backend/app/services/image_service.py`
- `backend/app/utils/sanitize.py`
- `backend/app/workers/scrape_worker.py`
- `backend/app/workers/review_worker.py`

### Frontend
- `frontend/src/api/client.js`
- `frontend/src/apps/admin/Dashboard.jsx`
- `frontend/src/apps/cms/ArticleDetail.jsx`
- `frontend/src/apps/review/Dashboard.jsx`
- `frontend/src/apps/review/ReviewQueue.jsx`
- `frontend/src/apps/review/ArticlePreviewModal.jsx`
- `frontend/src/apps/review/ConfirmDialog.jsx`
- `frontend/src/contexts/AuthContext.jsx`

### Site-renderer
- `site-renderer/src/index.css`
- `site-renderer/src/contexts/SiteContext.jsx`
- `site-renderer/src/components/ArticleCard.jsx`
- `site-renderer/src/components/ArticleDetail.jsx`
- `site-renderer/src/templates/TemplateA.jsx`
- `site-renderer/src/templates/TemplateB.jsx`
- `site-renderer/src/templates/TemplateC.jsx`
- `site-renderer/src/templates/TemplateD.jsx`
- `site-renderer/src/templates/TemplateE.jsx`
- `site-renderer/src/utils/defaultImages.js`

---

## Critical Issues Found and Fixed

### 1. Privilege Escalation via Self-Registration

**File:** `backend/app/routes/auth.py` line 13 (`register` function)
**Severity:** CRITICAL
**Description:** The `POST /auth/register` endpoint accepted an arbitrary `role` field from the request body. A caller could POST `{"email": "...", "password": "...", "full_name": "...", "role": "admin"}` to create an admin account for themselves.
**Fix Applied:** The `register` handler now forces `role=UserRole.viewer` regardless of what the caller sends. The field still exists in `UserCreate` schema for compatibility but is ignored during registration. A comment explains the design decision.

### 2. Database `connect_args` Incompatibility with Postgres

**File:** `backend/app/database.py` line 8
**Severity:** CRITICAL (would crash on Postgres deployment)
**Description:** `connect_args={"check_same_thread": False}` was applied unconditionally. This argument is SQLite-specific; passing it to a Postgres connection raises a `TypeError` and prevents the application from starting.
**Fix Applied:** `_connect_args` is now set only when `DATABASE_URL` starts with `sqlite`.

### 3. HTML Sanitizer Missing Several Dangerous Tags

**File:** `backend/app/utils/sanitize.py`
**Severity:** HIGH
**Description:** The regex denylist did not include `<svg>`, `<math>`, `<template>`, `<meta>`, `<link>`, `<base>`, or the `srcdoc` attribute. An attacker who could control `content_html` (e.g. via a compromised scrape source) could inject XSS payloads through these vectors.
- `<svg onload=...>` is a classic XSS vector not covered by the old pattern.
- `<meta http-equiv="refresh">` enables redirect attacks.
- `srcdoc` on any element renders arbitrary HTML.
**Fix Applied:** Added all missing tags to both `_DANGEROUS_TAGS` and `_DANGEROUS_SELF_CLOSING` patterns; added `_SRCDOC_ATTR` pattern; added `formaction` and `vbscript:` to the attribute denylist; added clear comments explaining the denylist limitation and recommending DOMPurify.

### 4. Hardcoded `localhost:8000` in Frontend API Client

**File:** `frontend/src/api/client.js` line 6
**Severity:** MEDIUM (production deployment blocker)
**Description:** The `baseURL` was hardcoded to `http://localhost:8000`. Any production build would silently point at localhost and fail.
**Fix Applied:** Now reads `import.meta.env.VITE_API_URL` with `http://localhost:8000` as a dev-only fallback. Set `VITE_API_URL` in `frontend/.env.production` before building for deployment.

---

## Medium Issues Found and Fixed (Docstrings / Comments)

All the following files had missing or Hebrew-only docstrings. English docstrings and module-level descriptions were added:

| File | What was added |
|------|---------------|
| `backend/app/config.py` | Module docstring; `Settings` class docstring; `get_settings` docstring |
| `backend/app/database.py` | Updated `get_db` docstring (English); comment explaining SQLite-only `connect_args` |
| `backend/app/models/__init__.py` | Module docstring explaining import purpose for Alembic autogenerate |
| `backend/app/models/article.py` | Module docstring describing status transitions |
| `backend/app/security/auth.py` | Module docstring with security invariants; English docstrings on all functions |
| `backend/app/security/permissions.py` | Module docstring with usage examples; English docstrings on all functions |
| `backend/app/routes/auth.py` | Module docstring listing routes; `register` docstring explains role override |
| `backend/app/routes/cms/articles.py` | Module docstring |
| `backend/app/routes/cms/categories.py` | Module docstring |
| `backend/app/routes/public/public.py` | Module docstring with XSS note |
| `backend/app/routes/admin/analytics.py` | Module docstring with rate-limit warning; function docstrings |
| `backend/app/routes/admin/users.py` | Module docstring |
| `backend/app/routes/sites/sites.py` | Module docstring |
| `backend/app/routes/scraper/jobs.py` | Module docstring |
| `backend/app/services/scraper.py` | `_complete_job` and `_fail_job` docstrings |
| `backend/main.py` | `lifespan` docstring; `health_check` docstring |
| `frontend/src/api/client.js` | JSDoc comment explaining baseURL resolution |
| `frontend/src/apps/review/ArticlePreviewModal.jsx` | Security comment on `dangerouslySetInnerHTML` |
| `site-renderer/src/components/ArticleDetail.jsx` | Security comment on `dangerouslySetInnerHTML` |

---

## Security Assessment — Items Confirmed Safe

### JWT Security
- **Algorithm pinned:** `decode_access_token` calls `jwt.decode(..., algorithms=[settings.algorithm])`. Passing an explicit list to python-jose makes the `none` algorithm attack impossible.
- **Expiry enforced:** `exp` claim set on every token; python-jose rejects expired tokens and `decode_access_token` returns `None`.
- **Secret from env:** `settings.secret_key` read from environment variable only.

### API Key Exposure
- No API keys hardcoded anywhere. All keys (`ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_API_KEY`, `UNSPLASH_ACCESS_KEY`) are read via `Settings` (pydantic-settings from `.env`).
- `/docs` (Swagger UI) is disabled in non-debug environments: `docs_url="/docs" if settings.debug else None`.

### CORS
- `allow_origins` is explicitly locked to `localhost:5173–5177` (dev ports only). Not `"*"`. This is correct for development; see recommendation below for production.

### SQL Injection
- All DB queries use the SQLAlchemy ORM with parameterised queries. No raw string interpolation in any query found.

### SSRF
- `validate_url()` in `scraper.py` resolves hostname to IP and blocks all RFC-1918, loopback, link-local, and ULA IPv6 ranges before any HTTP request.

### Auth Coverage on Routes
- All non-public routes have `Depends(get_current_user)` or a higher-privilege dependency.
- `POST /analytics/track` is intentionally unauthenticated (called by the site renderer for anonymous visitors). This is by design but carries risk (see recommendations).

### Worker Error Handling
- Both `scrape_worker.py` and `review_worker.py` wrap their inner loops in `try/except Exception` + `logger.exception(...)`. A single bad article or job cannot crash the worker.

---

## Recommendations (Not Auto-Fixed)

These items require discussion or broader changes and were not auto-fixed.

### R1 — Rate Limiting on High-Risk Endpoints

**Risk:** Medium-High
**Affected endpoints:**
- `POST /analytics/track` — unauthenticated, no rate limit. A bot can generate millions of fake page-view events inflating analytics and filling the DB.
- `POST /auth/login` — brute-force password guessing is unlimited.
- `POST /auth/register` — account enumeration / spam account creation is unlimited.

**Recommendation:** Add [slowapi](https://github.com/laurentS/slowapi) (FastAPI-compatible rate limiter) or an nginx rate-limit layer. For analytics, a token-bucket of ~10 req/s per IP is reasonable. For auth, ~5 req/min per IP.

### R2 — DOMPurify Client-Side Sanitization

**Risk:** Medium
**Affected files:**
- `site-renderer/src/components/ArticleDetail.jsx` (public-facing, all site visitors)
- `frontend/src/apps/review/ArticlePreviewModal.jsx` (internal, editors only)

**Description:** Both components render `content_html` with `dangerouslySetInnerHTML`. The HTML is sanitized on the backend before storage, but the server-side sanitizer is a regex denylist (inherently weaker than an allowlist). If any bypass is found, XSS would execute in viewers' browsers.

**Recommendation:** Add `dompurify` (`npm install dompurify`) and wrap the render:
```jsx
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content_html) }} />
```
This is defence-in-depth: even if the server-side sanitizer is bypassed, DOMPurify would strip the payload in the browser.

### R3 — CORS Configuration for Production

**Risk:** Medium (post-deployment)
**File:** `backend/main.py` lines 53–63

The current CORS config allows only `localhost:5173–5177`, which is correct for development. Before deploying to AWS:
- Add the actual production domain(s) to `allow_origins`.
- Consider loading `allow_origins` from a `CORS_ORIGINS` env variable (comma-separated list).
- Never use `allow_origins=["*"]` in production because `allow_credentials=True` combined with a wildcard origin is rejected by the browser anyway.

### R4 — Missing Database Indexes

**Risk:** Low (performance) / Medium at scale

The following columns are frequently used in `WHERE` clauses but lack explicit indexes:

| Table | Column | Used in |
|-------|--------|---------|
| `articles` | `status` | `review_worker`, `/public/sites/{id}/articles`, CMS list |
| `articles` | `site_id` | Almost every article query |
| `analytics` | `created_at` | Analytics list endpoint (ORDER BY) |
| `analytics` | `site_id` | Analytics filter |

The `id` (PK) and `source_url` (unique) columns are already indexed.

**Recommendation:** Create a new Alembic migration:
```python
op.create_index('ix_articles_status', 'articles', ['status'])
op.create_index('ix_articles_site_id', 'articles', ['site_id'])
op.create_index('ix_analytics_site_id', 'analytics', ['site_id'])
op.create_index('ix_analytics_created_at', 'analytics', ['created_at'])
```

### R5 — N+1 Query Pattern in Public Articles Endpoint

**Risk:** Low (current scale) / Medium at scale
**File:** `backend/app/routes/public/public.py`, `get_public_articles`

The endpoint fetches all published articles with `.all()` and then sorts them in Python (pinned vs unpinned). At scale (thousands of articles), this loads all rows into memory. The sorting should be done in SQL:

```python
# Replace Python-side sort with a DB-level ORDER BY
from sqlalchemy import case
query = query.order_by(
    Article.is_pinned.desc(),
    case((Article.is_pinned == True, Article.pin_order), else_=0).asc(),
    Article.created_at.desc()
)
return query.all()
```

### R6 — `GET /analytics` Has No Pagination

**Risk:** Low (current scale) / High at scale
**File:** `backend/app/routes/admin/analytics.py`, `list_events`

Returns all matching analytics rows with no limit. As the analytics table grows this will become very slow and return very large payloads.

**Recommendation:** Add `limit: int = Query(100, le=1000)` and `offset: int = Query(0)` parameters.

### R7 — `GET /cms/articles` Returns All Articles With No Pagination

**Risk:** Low (current scale) / Medium at scale
**File:** `backend/app/routes/cms/articles.py`, `list_articles`

Same pattern as R6. The CMS articles list and the admin dashboard fetch all articles with no limit, which will become slow as content grows.

### R8 — Regex HTML Sanitizer vs Allowlist Library

**Risk:** Medium (ongoing)
**File:** `backend/app/utils/sanitize.py`

The current sanitizer is a denylist (remove known-bad patterns). Denylists are fundamentally weaker than allowlists because attackers can find novel bypass vectors. For production, consider replacing with [bleach](https://bleach.readthedocs.io/) or [nh3](https://nh3.readthedocs.io/) which use allowlist-based sanitization backed by a real HTML parser (not regex).

Example with nh3 (Rust-backed, much faster than bleach):
```python
import nh3

ALLOWED_TAGS = {"h2", "h3", "h4", "p", "strong", "em", "blockquote", "ul", "ol", "li", "img", "a"}
ALLOWED_ATTRIBUTES = {"img": {"src", "alt"}, "a": {"href", "rel", "target"}}

def sanitize_html(html: str) -> str:
    return nh3.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES)
```

### R9 — `source.unsplash.com/featured` Endpoint Deprecated

**Risk:** Low (reliability)
**File:** `site-renderer/src/utils/defaultImages.js`

The URL pattern `https://source.unsplash.com/featured/?{keyword}` uses Unsplash's legacy Source API which Unsplash has announced as deprecated. It may stop working without notice.

**Recommendation:** Use the Unsplash API endpoint (`/search/photos`) directly (already used in `image_service.py`) and cache keyword→URL mappings, or switch to a maintained service.

### R10 — `app_env` Exposed in Health Endpoint

**Risk:** Low (information disclosure)
**File:** `backend/main.py`, `health_check`

The `/health` endpoint returns `{"status": "ok", "env": "production"}`. Confirming you are in production is minor information leakage. Consider returning only `{"status": "ok"}` or restricting the env field to internal/admin callers.

---

## Code Quality Observations

### Dead Code
- `app/models/article_block.py` — `BlockType` enum has no DB table. Used only by the scraper's HTML parser. A comment clarifying this was added to `models/__init__.py` to prevent future confusion.

### Duplicate Component
- `AiScoreBadge` and `FlagList`/`FlagChip` are defined independently in both `ReviewQueue.jsx` and `ArticlePreviewModal.jsx`. They could be extracted to a shared `frontend/src/components/` file.

### Inconsistent Error Handling in Frontend
- `EditableField.handleSave` in `ArticleDetail.jsx` uses `alert()` to show save errors. This is inconsistent with the rest of the UI which uses React Query mutation state. Consider using a toast notification system.

### Missing `aria-label` on Icon Buttons
- Several toolbar buttons in `TipTapEditor` (`ArticleDetail.jsx`) use emoji or short text as labels without `aria-label` attributes, reducing accessibility.

### `connect_args` Comment in Hebrew
- The original `database.py` had a Hebrew comment (`# נדרש רק ל-SQLite`). This is fine for a single developer but inconsistent with the rest of the codebase's English comments. Translated to English in the fix.

---

## Overall Security Assessment

**Rating: GOOD with minor gaps**

The codebase demonstrates solid security awareness:
- JWT implementation is correct (algorithm pinned, expiry enforced)
- All API keys come from environment variables
- SSRF protection is comprehensive
- No SQL injection vectors found
- Role-based access control is consistently applied
- Soft-delete pattern prevents accidental data loss

The main gaps are:
1. The self-registration role escalation (now fixed) was a significant privilege escalation vector
2. The HTML sanitizer denylist is weaker than an allowlist approach
3. No rate limiting on authentication or analytics endpoints (acceptable for dev, must fix before production)
4. DOMPurify is absent on the client side

The codebase is **ready for continued development** and **not ready for public production** without addressing R1 (rate limiting) and R2 (DOMPurify) at minimum.

---

## Session 2 Security Audit — 2026-03-14

**Auditor:** Claude Code (claude-sonnet-4-6)
**Scope:** All new routes and services added since Session 1: trends, settings, logos, images, site enrichment, image worker, image validator, logo service

### New Routes Audited

| Route | Auth | Verdict |
|-------|------|---------|
| `GET/POST /trends/*` | `require_admin` | ✅ Safe |
| `GET/PATCH /settings/{key}` | `require_admin` | ✅ Safe |
| `POST /sites/ai-preview` | `require_admin` | ✅ Safe |
| `POST /sites/{id}/ai-enrich` | `require_admin` | ✅ Safe |
| `GET /sites/{id}/default-images` | `require_admin` | ✅ Safe |
| `POST /sites/{id}/regenerate-logo` | `require_admin` | ✅ Safe |
| `POST /admin/images/audit` | `require_admin` | ✅ Safe |
| `PATCH /scraper/jobs/{id}` | `require_admin` | ✅ Safe |

All new routes added since Session 1 have correct `require_admin` protection. No auth gaps found.

### New Services Audited

**`logo_service.py`**
- API key (`STABILITY_API_KEY`) read from `Settings` only, never hardcoded — ✅
- API key never logged (checked `logger.info` calls: only logs site name and base64 length) — ✅
- SVG fallback uses `_xml_escape()` on site name / initials before injecting into SVG markup — ✅ XSS-safe
- `_safe_color()` validates hex colors with `^#[0-9a-fA-F]{6}$` before putting them in SVG attributes — ✅

**`image_service.py` (updated)**
- New `excluded_urls` parameter does not log any URL contents at INFO level — ✅
- Photo key normalisation (`_unsplash_photo_key`) uses regex only, no eval — ✅
- `per_page` capped at `_CANDIDATES_PER_PAGE=10`; no user-controlled `per_page` — ✅

**`image_validator.py`**
- HEAD requests use `follow_redirects=True` with `max_redirects=5` — prevents redirect loops — ✅
- Only checks URLs already stored by the backend scraper — no user-supplied proxy targets — ✅
- Trusted-CDN fast-path (`images.unsplash.com`, `source.unsplash.com`) avoids HEAD requests on generated URLs — ✅

**`trends_service.py`**
- `create_site_from_trend()` enforces `TRENDS_AUTO_SITE_LIMIT` via `settings_service.get()` — configurable but still enforced — ✅
- Trend keyword passed to Claude as a user message, not injected into system prompt or code — ✅

**`settings_service.py`**
- `set_value()` validates `value_type` before casting — prevents type confusion attacks — ✅
- `PATCH /settings/{key}` allows only keys already in `platform_settings` table (404 if unknown key) — ✅
- No eval or exec used for type casting — uses explicit `float()`, `int()`, `bool()` casts — ✅

### Code Quality Fixes Applied This Session

| Issue | File | Fix |
|-------|------|-----|
| `import json` inside function body | `ai_review.py` | Moved to module level |

### New Recommendations

**R11 — Unsplash Source API Deprecation (carried forward)**
The `source.unsplash.com/featured/?{keyword}` pattern in `defaultImages.js` tier-2 fallback uses Unsplash's deprecated Source API. This still works but may stop without notice. Tier-1 (stored images) and Tier-3 (hardcoded fallbacks) would absorb the failure, but tier-2 would silently serve dead images. Migration path: replace with a small set of pre-searched and stored fallback URLs.

**R12 — Stability AI Timeout Risk**
`logo_service.py` has `_REQUEST_TIMEOUT = 60.0`. The logo generation call blocks the `POST /sites` request for up to 60 seconds if Stability AI is slow. This is currently handled via `asyncio.create_task()` for background site creation, but synchronous `POST /sites/{id}/regenerate-logo` will block. Consider adding a timeout on the client side or running logo generation as a background task for all callers.

**R13 — Unsplash `excluded_urls` Memory Growth**
The `excluded_urls` set passed to `enrich_article_images` is built by querying all site articles' `main_image_url` values in one pass. At scale (thousands of articles per site), this is a large in-memory set. For now (19 articles) this is fine. At 10,000+ articles, consider limiting to the most recent N articles or querying only photo IDs.

### Updated Overall Assessment

**Rating: GOOD with well-understood gaps**

All new routes and services added since Session 1 are correctly protected and follow the established security patterns. The codebase has grown substantially while maintaining consistent auth, error handling, and API key hygiene. The three outstanding production blockers remain:

1. **R1** — Rate limiting on `/analytics/track`, `/auth/login`, `/auth/register`
2. **R2** — DOMPurify client-side sanitization
3. **R3** — CORS `allow_origins` must be updated from localhost before production deployment

---

## Session 3 — 2026-03-15

### Changes Reviewed

**API Usage & Costs dashboard** — `api_usage_log` table, `usage_service.py`, `GET /admin/api-usage`, `ApiUsage.jsx`, instrumentation of all 6 external service integrations.

### Security Findings

**`GET /admin/api-usage` — SAFE**
- Route is behind `Depends(require_admin)` — only authenticated admins can access it. ✅
- Stability AI live balance endpoint is called server-side; the API key is never forwarded to or returned to the frontend. ✅
- Cost projections are estimates only — they use fixed rate constants, not live billing data. The response includes no pricing or account metadata beyond credit balance. ✅

**`usage_service.log_api_call()` — SAFE**
- Synchronous DB insert, never raises — all exceptions caught at `except Exception` and discarded. No information leakage risk. ✅
- The `meta` field is written as a JSON blob from a controlled internal dict (never from user input). No injection risk. ✅
- API keys and request contents are NOT written to `api_usage_log`; only service slug, endpoint name, success flag, and token/credit counts. ✅

**`api_usage_log` table — SAFE**
- No PII stored — service slugs, endpoint names, token counts, success booleans only. ✅
- Table is append-only from the application perspective (no DELETE or UPDATE routes). ✅
- Alembic migration `c3d4e5f6a7b8` creates two indexes (`service`, `timestamp`) — no unique constraint, so concurrent inserts cannot conflict. ✅

**Service instrumentation (scraper, ai_review, image_service, logo_service, trends_service) — SAFE**
- `log_api_call` is always called AFTER the external API responds (never before, never inside the sync thread). ✅
- Errors in the external call are still properly propagated to the calling service; the log call is a side-effect only. ✅
- Failure to write the log row is silently swallowed — does not affect service behaviour. ✅

### New Recommendations

**R14 — api_usage_log retention policy**
The table grows indefinitely (one row per external API call). At scale (thousands of scrapes/day), it could become large. Add a periodic cleanup job or DB retention policy to delete rows older than 90 days. For now (dev environment, low volume) this is acceptable.

**R15 — Cost projection accuracy**
`cost_projected_eom` is computed as `cost_mtd / days_elapsed * days_in_month`. On day 1 of the month this gives a large projection from a single data point. Consider using a 7-day rolling average instead of a strict daily average for more stable projections.

**R16 — Stability AI credits are in-flight only**
`credits_remaining` is fetched live from `api.stability.ai/v1/user/balance` with an 8-second timeout. If the endpoint is slow or down, the field is `null` in the response. The frontend already handles `null` gracefully. No change needed now, but a cached credit value (refreshed every hour) would be more reliable.

### Updated Overall Assessment

**Rating: GOOD with well-understood gaps**

The API Usage dashboard adds useful cost visibility without introducing new attack surface. All routes remain admin-only. The instrumentation is purely additive and does not change any service behaviour. Outstanding production blockers unchanged (R1, R2, R3).
