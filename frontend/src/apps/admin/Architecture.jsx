/**
 * Architecture — embedded platform architecture and data-flow reference.
 *
 * Tabs
 * ----
 *  Flow         End-to-end data flow with clickable steps for detail panels.
 *               Trends pipeline (left) + Content pipeline (right).
 *               Inline security badges appear at relevant flow steps (SSRF on
 *               scrape_worker, XSS/SQL on articles-pending, JWT on score gate,
 *               RBAC on CMS review) — clicking them opens the security detail card.
 *
 *  Architecture 7-layer system diagram: External Services → Backend →
 *               Security Layer (collapsible) → Platform Settings →
 *               Frontend Apps → Site Renderer → Database.
 *
 *  Guidelines   Reference cards: CLAUDE.md, REVIEW.md, slash commands, config
 *               systems, and Security Guidelines (8 invariants + last audit date).
 *
 * Features
 * --------
 *  - Dark / light mode via ThemeContext (toggle in AdminLayout nav bar).
 *  - Stats bar: live platform metrics from the API.
 *  - Clickable Flow nodes: click any step to see a detail card below the diagram.
 *  - Interactive Security layer: 8 clickable nodes each showing file, description, and a concrete example.
 *  - Inline security badges at relevant flow steps link to the security detail panel.
 *  - Architecture tab Security Layer: collapsible card with all 8 controls (file + what it protects).
 *  - Guidelines tab Security Guidelines card: 8 invariants, last audit date, link to REVIEW.md.
 *  - No external diagram libraries — pure React + Tailwind CSS.
 *
 * Mounted at /admin/architecture (admin role).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '../../context/ThemeContext'
import api from '../../api/client'

// ---------------------------------------------------------------------------
// Clickable node detail definitions (Flow tab)
// ---------------------------------------------------------------------------

const STEP_DETAILS = {
  'google-trends-rss': {
    title: 'Google Trends RSS',
    body:  'Polls trends.google.com/trending/rss for each configured region. Returns keywords with their trend score and volume. No API key required — uses the public RSS feed.',
  },
  'trends-worker': {
    title: 'trends_worker',
    body:  'Async background task launched at startup. Reads trends_fetch_interval_hours from PlatformSettings on every cycle so the interval can be changed without a restart. Calls fetch_and_store_trends() which deduplicates by (keyword, region).',
  },
  'trend-rows-db': {
    title: 'Trend rows (database)',
    body:  'Each trend is stored with keyword, region, score, status (new → used | dismissed), and an optional site_id FK when a site is created from it.',
  },
  'admin-trends': {
    title: 'Admin → Trends dashboard',
    body:  'Two-tab view: "Trending" shows the live keyword list per region with Run Now trigger and dismiss/create-site actions. "Explore" uses pytrends to chart interest over time, interest by region, and related queries for any keyword.',
  },
  'claude-site-config': {
    title: 'Claude Haiku — site config',
    body:  'When an admin clicks "Create Site" from a trend, Claude Haiku generates a suggested site name, template, language, and brand colors. The admin can edit before confirming. Uses the same anthropic SDK as the review engine.',
  },
  'site-created': {
    title: 'Site + ScrapeJob created',
    body:  'A new Site row is inserted with the AI-suggested config, and a linked ScrapeJob is created using the trending keyword. The trend status is updated to "used" and site_id is set.',
  },
  'tavily': {
    title: 'Tavily API',
    body:  'Primary article source. Returns search results with URL, title, snippet, and an ai_score (relevance 0–1). The Tavily score is stored directly as the article\'s initial ai_score before Claude Haiku review.',
  },
  'google-cse': {
    title: 'Google CSE',
    body:  'Secondary fallback when Tavily returns fewer results than needed. Uses Google Custom Search Engine (GOOGLE_CSE_ID + GOOGLE_API_KEY env vars). Results are merged and deduplicated by URL.',
  },
  'scrape-worker': {
    title: 'scrape_worker',
    body:  'Runs every 60 seconds. Queries ScrapeJobs where next_run_at <= now, picks the highest-priority job, and calls run_scrape_job(). Reads max_searches_per_job from PlatformSettings (default 10).',
  },
  'articles-pending': {
    title: 'Articles — status: pending',
    body:  'After passing quality gates (min_paragraph_blocks, min_word_count — both configurable), articles are saved with status=pending. content_html stores the full extracted HTML. main_image_url is populated by Unsplash if found.',
  },
  'review-worker': {
    title: 'review_worker',
    body:  'Runs every 30 seconds. Picks up to 5 pending articles per cycle, sends each to Claude Haiku for review, and updates the article with rewritten content, score, SEO fields, and optionally publishes it.',
  },
  'claude-review': {
    title: 'Claude Haiku AI Review',
    body:  'Single Anthropic API call using tool_use + tool_choice="tool" for guaranteed JSON output. Rewrites content_html, generates title/seo_title/seo_description/seo_keywords, scores 0–1, adds flags[], auto-detects language, translates if needed.',
  },
  'score-gate': {
    title: 'ai_score threshold gate',
    body:  'Configurable via PlatformSettings: ai_review_threshold (default 0.5) and auto_publish_enabled (default true). If auto_publish_enabled=false, ALL articles stay pending regardless of score.',
  },
  'auto-published': {
    title: 'Auto-published',
    body:  'Article status becomes "published". Immediately visible on the public site renderer. The Unsplash image service runs after scoring to enrich articles missing main_image_url.',
  },
  'site-renderer': {
    title: 'Site Renderer',
    body:  'Separate Vite app per site, selected by VITE_SITE_ID env var. Fetches from /public/* endpoints (no auth). Templates A–E support RTL, per-site brand colors, and default image fallbacks via getDefaultImage().',
  },
  'public-site': {
    title: 'Public Site',
    body:  'Full public-facing news/blog site. Template chosen per site (A: Newspaper, B: Magazine, C: Blog, D: Cards, E: Sidebar). Pinned articles appear first. Full RTL support for Hebrew and Arabic.',
  },
  'stays-pending': {
    title: 'Stays pending',
    body:  'Article score < threshold or auto_publish_enabled=false. Article sits in the review queue for human editors.',
  },
  'cms-review': {
    title: 'CMS · Review app',
    body:  'Editors and admins log in at port 5173. The Review tab shows pending articles sortable by score, with full content preview, AI flags, and approve/reject actions. Approve = PATCH status=published; Reject = PATCH status=removed (soft delete).',
  },

  // Security nodes
  'sec-ssrf': {
    title: 'SSRF Protection',
    file:  'app/services/scraper.py — validate_url()',
    body:  'Every URL fetched by the scraper is resolved to an IP address and rejected if it falls inside RFC-1918 private ranges (10.x, 172.16–31.x, 192.168.x), loopback (127.x), or IPv6 link-local/ULA blocks. Scheme is also whitelisted to http/https only.',
    example: 'Request to http://192.168.1.1/secret → blocked before any network call.',
  },
  'sec-jwt': {
    title: 'JWT Authentication',
    file:  'app/security/auth.py — create_access_token / decode_access_token',
    body:  'All write routes (and most read routes) require a valid JWT in the Authorization header. Tokens are signed with HS256 using SECRET_KEY from env. Algorithm is pinned — the "none" algorithm attack is prevented by passing algorithms=[settings.algorithm] to PyJWT.',
    example: 'Missing or expired token → 401 Unauthorized before route handler runs.',
  },
  'sec-xss': {
    title: 'XSS Sanitizer',
    file:  'app/utils/sanitize.py — sanitize_html()',
    body:  'All article content_html is passed through a denylist sanitizer before being saved. Blocked tags include <script>, <iframe>, <object>, <embed>, <svg>, <math>, <meta>, <link>, <template>, and event-handler attributes (on*). Uses html.parser — no external lib dependency.',
    example: '<script>alert(1)</script> in scraped content → stripped before DB write.',
  },
  'sec-bcrypt': {
    title: 'bcrypt Passwords',
    file:  'app/security/auth.py — hash_password / verify_password',
    body:  'All user passwords are hashed with bcrypt (passlib, 12 rounds) before storage. Plain-text passwords are never written to the database or logged. Login uses constant-time comparison via passlib.verify to prevent timing attacks.',
    example: 'POST /auth/register → password field stored as $2b$12$... hash, never in plain text.',
  },
  'sec-rbac': {
    title: 'Role-Based Access',
    file:  'app/security/permissions.py — require_admin / require_editor',
    body:  'Three roles: admin (full access), editor (CMS + review), viewer (read-only). Route dependencies enforce roles server-side on every request — the JWT role claim is verified, not trusted from the request body. Self-registration is forced to viewer regardless of what is sent.',
    example: 'Editor calling DELETE /admin/users → 403 Forbidden from require_admin dependency.',
  },
  'sec-pydantic': {
    title: 'Input Validation',
    file:  'app/schemas/ — Pydantic v2 models on every route',
    body:  'Every API endpoint uses a Pydantic request model. Types, lengths, and allowed values are validated before any business logic runs. FastAPI returns a structured 422 Unprocessable Entity with field-level error details on any validation failure.',
    example: 'POST /sites with template_id="invalid" → 422 before DB is touched.',
  },
  'sec-ratelimit': {
    title: 'Per-Domain Rate Limit',
    file:  'app/services/scraper.py — _last_fetch_time dict',
    body:  'The scraper enforces a minimum 2-second gap between successive requests to the same domain using a module-level dict keyed by hostname. This prevents hammering individual news sources and reduces the chance of getting IP-blocked during bulk scrape runs.',
    example: 'Two articles from bbc.com in one job → second fetch waits at least 2s.',
  },
  'sec-sqli': {
    title: 'SQL Injection Protection',
    file:  'SQLAlchemy ORM — used throughout all services and routes',
    body:  'All database queries use SQLAlchemy ORM methods (db.query(...).filter(...)) or Core expressions with bound parameters. Raw SQL strings are never interpolated. SQLAlchemy passes all values as parameterized placeholders, making SQL injection structurally impossible.',
    example: 'GET /cms/articles?site_id=1 OR 1=1 → ORM binds "1 OR 1=1" as a literal value, not SQL.',
  },
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function Node({ id, color = 'gray', icon, title, sub, wide = false, className = '', onSelect, selected }) {
  const { isDark } = useTheme()

  const palette = isDark ? {
    indigo:  'bg-indigo-900/60 border-indigo-500  text-indigo-200',
    blue:    'bg-blue-900/60   border-blue-500    text-blue-200',
    sky:     'bg-sky-900/60    border-sky-500     text-sky-200',
    green:   'bg-emerald-900/60 border-emerald-500 text-emerald-200',
    amber:   'bg-amber-900/60  border-amber-500   text-amber-200',
    red:     'bg-red-900/60    border-red-500     text-red-200',
    purple:  'bg-purple-900/60 border-purple-500  text-purple-200',
    gray:    'bg-gray-800      border-gray-600    text-gray-200',
    slate:   'bg-slate-800     border-slate-600   text-slate-200',
  } : {
    indigo:  'bg-indigo-50  border-indigo-200  text-indigo-900',
    blue:    'bg-blue-50    border-blue-200    text-blue-900',
    sky:     'bg-sky-50     border-sky-200     text-sky-900',
    green:   'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber:   'bg-amber-50   border-amber-200   text-amber-900',
    red:     'bg-red-50     border-red-200     text-red-900',
    purple:  'bg-purple-50  border-purple-200  text-purple-900',
    gray:    'bg-gray-50    border-gray-200    text-gray-800',
    slate:   'bg-slate-100  border-slate-300   text-slate-800',
  }

  const clickable = id && onSelect
  const ring = selected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''

  return (
    <div
      onClick={clickable ? () => onSelect(id === selected ? null : id) : undefined}
      className={`border rounded-xl px-3 py-2.5 text-center shadow-sm transition-all
        ${wide ? 'min-w-48' : 'min-w-36'}
        ${palette[color]}
        ${clickable ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''}
        ${ring}
        ${className}`}
    >
      {icon && <div className="text-base leading-none mb-0.5">{icon}</div>}
      <div className="text-xs font-semibold leading-tight">{title}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5 leading-snug">{sub}</div>}
      {clickable && <div className="text-[9px] opacity-40 mt-1">click for details</div>}
    </div>
  )
}

function Down({ label } = {}) {
  const { isDark } = useTheme()
  return (
    <div className="flex flex-col items-center my-0.5">
      <div className={`w-px h-4 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
      <div className={`text-[11px] leading-none ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>▼</div>
      {label && (
        <div className={`text-[9px] mt-0.5 text-center max-w-48 leading-snug px-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {label}
        </div>
      )}
    </div>
  )
}

function Right() {
  const { isDark } = useTheme()
  return (
    <div className={`flex items-center self-center mx-1 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
      <div className={`w-5 h-px ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
      <div className="text-[11px] leading-none">▶</div>
    </div>
  )
}

function Diamond({ id, title, sub, onSelect, selected }) {
  const { isDark } = useTheme()
  const ring = selected ? 'ring-2 ring-indigo-500 ring-offset-1 rounded-md' : ''
  return (
    <div
      className={`flex flex-col items-center my-0.5 ${id ? 'cursor-pointer' : ''} ${ring}`}
      onClick={id && onSelect ? () => onSelect(id === selected ? null : id) : undefined}
    >
      <div className={`w-px h-3 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
      <div className="relative w-44 h-12 flex items-center justify-center">
        <div
          className={`absolute inset-0 ${isDark ? 'bg-purple-900/60 border-purple-500' : 'bg-purple-100 border-purple-300'} border-2`}
          style={{ transform: 'rotate(10deg) skewX(-10deg)', borderRadius: '6px' }}
        />
        <div className="relative z-10 text-center">
          <div className={`text-xs font-bold ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>{title}</div>
          {sub && <div className={`text-[9px] ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>{sub}</div>}
        </div>
      </div>
      {id && <div className={`text-[9px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>click for details</div>}
    </div>
  )
}

function LayerBox({ label, color = 'gray', collapsible = false, children }) {
  const { isDark } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  const border = isDark ? {
    indigo: 'border-indigo-700 bg-indigo-950/40',
    sky:    'border-sky-700    bg-sky-950/40',
    green:  'border-emerald-700 bg-emerald-950/40',
    amber:  'border-amber-700  bg-amber-950/40',
    purple: 'border-purple-700 bg-purple-950/40',
    red:    'border-red-800    bg-red-950/30',
    gray:   'border-gray-700   bg-gray-800/40',
  } : {
    indigo: 'border-indigo-200 bg-indigo-50/60',
    sky:    'border-sky-200    bg-sky-50/60',
    green:  'border-emerald-200 bg-emerald-50/60',
    amber:  'border-amber-200  bg-amber-50/60',
    purple: 'border-purple-200 bg-purple-50/60',
    red:    'border-red-200    bg-red-50/40',
    gray:   'border-gray-200   bg-gray-50/60',
  }
  const header = isDark ? {
    indigo: 'text-indigo-400',
    sky:    'text-sky-400',
    green:  'text-emerald-400',
    amber:  'text-amber-400',
    purple: 'text-purple-400',
    red:    'text-red-400',
    gray:   'text-gray-400',
  } : {
    indigo: 'text-indigo-600',
    sky:    'text-sky-600',
    green:  'text-emerald-600',
    amber:  'text-amber-600',
    purple: 'text-purple-600',
    red:    'text-red-600',
    gray:   'text-gray-500',
  }
  return (
    <div className={`border-2 rounded-2xl p-4 ${border[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`text-[10px] font-bold uppercase tracking-widest ${header[color]}`}>
          {label}
        </div>
        {collapsible && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors
              ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
          >
            {collapsed ? '▶ expand' : '▼ collapse'}
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  )
}

function LayerArrow() {
  const { isDark } = useTheme()
  return (
    <div className="flex justify-center my-1">
      <div className="flex flex-col items-center">
        <div className={`w-px h-4 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
        <div className={`text-sm leading-none ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>▼</div>
      </div>
    </div>
  )
}

/**
 * SecMini — tiny inline security tag.
 * Clicking it selects the corresponding security node in the detail panel,
 * exactly like clicking the full node in the security bar at the bottom.
 */
function SecMini({ secId, onSelect, selected }) {
  const { isDark } = useTheme()
  const detail = STEP_DETAILS[secId]
  if (!detail) return null
  const isActive = selected === secId
  return (
    <button
      onClick={() => onSelect(secId === selected ? null : secId)}
      title={detail.title}
      className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium transition-all
        ${isActive
          ? isDark
            ? 'bg-red-800 border-red-500 text-red-100'
            : 'bg-red-100 border-red-400 text-red-800'
          : isDark
            ? 'bg-red-950/40 border-red-800 text-red-400 hover:border-red-600 hover:bg-red-900/40'
            : 'bg-red-50 border-red-200 text-red-600 hover:border-red-400 hover:bg-red-100'
        }`}
    >
      🔒 {detail.title}
    </button>
  )
}

function TechPill({ label }) {
  const { isDark } = useTheme()
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-mono
      ${isDark
        ? 'bg-gray-800 border-gray-600 text-gray-300'
        : 'bg-white border-gray-200 text-gray-500'}`}
    >
      {label}
    </span>
  )
}

function SecurityBadge({ label }) {
  const { isDark } = useTheme()
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border
      ${isDark
        ? 'bg-red-900/40 border-red-700 text-red-300'
        : 'bg-red-50 border-red-200 text-red-700'}`}
    >
      🔒 {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Step detail card (shown below the flow when a node is selected)
// ---------------------------------------------------------------------------

function StepDetail({ stepId, onClose }) {
  const { isDark } = useTheme()
  const detail = STEP_DETAILS[stepId]
  if (!detail) return null

  return (
    <div className={`mt-4 mx-auto max-w-xl rounded-xl border p-4 shadow-md transition-all
      ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-indigo-100 text-gray-800'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-sm font-semibold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
          {detail.title}
        </h3>
        <button
          onClick={onClose}
          className={`text-xs leading-none mt-0.5 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
        >
          ✕
        </button>
      </div>
      {detail.file && (
        <p className={`text-[10px] font-mono mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {detail.file}
        </p>
      )}
      <p className={`text-xs mt-1.5 leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        {detail.body}
      </p>
      {detail.example && (
        <div className={`mt-2.5 rounded-lg px-3 py-2 text-[10px] font-mono leading-snug
          ${isDark ? 'bg-gray-900 text-gray-400 border border-gray-700' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}
        >
          <span className={`font-semibold mr-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>e.g.</span>
          {detail.example}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar() {
  const { isDark } = useTheme()

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: articleStats } = useQuery({
    queryKey: ['article-stats'],
    queryFn: () => api.get('/cms/articles/stats').then(r => r.data),
    staleTime: 60_000,
  })

  const stats = [
    { label: 'Sites',      value: sites.length || '—',                             color: isDark ? 'text-indigo-400' : 'text-indigo-600' },
    { label: 'Published',  value: articleStats?.by_status?.published ?? '—',       color: isDark ? 'text-emerald-400' : 'text-emerald-600' },
    { label: 'Pending',    value: articleStats?.by_status?.pending ?? '—',         color: isDark ? 'text-amber-400' : 'text-amber-600' },
    { label: 'Templates',  value: 5,                                                color: isDark ? 'text-sky-400' : 'text-sky-600' },
    { label: 'Workers',    value: 5,                                                color: isDark ? 'text-purple-400' : 'text-purple-600' },
    { label: 'Settings',   value: 21,                                               color: isDark ? 'text-gray-400' : 'text-gray-500' },
  ]

  return (
    <div className={`flex flex-wrap gap-px rounded-xl overflow-hidden border mb-6
      ${isDark ? 'border-gray-700 bg-gray-700' : 'border-gray-200 bg-gray-200'}`}
    >
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          className={`flex-1 min-w-20 flex flex-col items-center py-3 px-4
            ${isDark ? 'bg-gray-900' : 'bg-white'}`}
        >
          <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
          <span className={`text-[10px] uppercase tracking-wider mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FlowStep — clickable step with colored glow when active
// ---------------------------------------------------------------------------

/**
 * FlowStep wraps Node with an animated glow when selected.
 * The glow color matches the node's color palette.
 */
const GLOW_SHADOW = {
  indigo: '0 0 0 2px #6366f1, 0 0 16px 4px rgba(99,102,241,0.35)',
  blue:   '0 0 0 2px #3b82f6, 0 0 16px 4px rgba(59,130,246,0.35)',
  sky:    '0 0 0 2px #0ea5e9, 0 0 16px 4px rgba(14,165,233,0.35)',
  green:  '0 0 0 2px #10b981, 0 0 16px 4px rgba(16,185,129,0.35)',
  amber:  '0 0 0 2px #f59e0b, 0 0 16px 4px rgba(245,158,11,0.35)',
  red:    '0 0 0 2px #ef4444, 0 0 16px 4px rgba(239,68,68,0.35)',
  purple: '0 0 0 2px #a855f7, 0 0 16px 4px rgba(168,85,247,0.35)',
  gray:   '0 0 0 2px #6b7280, 0 0 16px 4px rgba(107,114,128,0.25)',
  slate:  '0 0 0 2px #64748b, 0 0 16px 4px rgba(100,116,139,0.25)',
}

function FlowStep({ id, color = 'gray', icon, title, sub, wide = false, onSelect, selected }) {
  const isActive = selected === id
  const shadow = isActive ? GLOW_SHADOW[color] || GLOW_SHADOW.gray : undefined

  return (
    <div style={shadow ? { boxShadow: shadow, borderRadius: '0.75rem', transition: 'box-shadow 0.2s' } : { transition: 'box-shadow 0.2s' }}>
      <Node
        id={id}
        color={color}
        icon={icon}
        title={title}
        sub={sub}
        wide={wide}
        onSelect={onSelect}
        selected={selected}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Flow tab
// ---------------------------------------------------------------------------

function FlowTab() {
  const { isDark } = useTheme()
  const [selected, setSelected] = useState(null)

  const sel = (id) => setSelected(prev => prev === id ? null : id)
  const stepProps = { onSelect: sel, selected }

  return (
    <div>
      {/* ── Main Content Pipeline (vertical, centered) ── */}
      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col items-center min-w-max mx-auto pt-2 px-4">
          <div className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`}>
            Content Pipeline
          </div>

          {/* Sources */}
          <div className="flex items-end gap-3 mb-1">
            <FlowStep id="tavily"     color="amber" icon="🔍" title="Tavily API"  sub="primary · ai_score" {...stepProps} />
            <FlowStep id="google-cse" color="amber" icon="🔎" title="Google CSE" sub="secondary fallback" {...stepProps} />
          </div>
          <Down />

          <FlowStep id="scrape-worker" color="amber" icon="⏰"
            title="scrape_worker" sub="every 60s · keyword search → HTML fetch"
            wide {...stepProps}
          />
          <div className="flex gap-1 my-0.5">
            <SecMini secId="sec-ssrf"      onSelect={sel} selected={selected} />
            <SecMini secId="sec-ratelimit" onSelect={sel} selected={selected} />
          </div>
          <Down label="max_searches_per_job · SSRF guard · quality gates" />

          <FlowStep id="articles-pending" color="gray" icon="📝"
            title="Articles" sub="status: pending · content_html"
            wide {...stepProps}
          />
          <div className="flex gap-1 my-0.5">
            <SecMini secId="sec-xss"  onSelect={sel} selected={selected} />
            <SecMini secId="sec-sqli" onSelect={sel} selected={selected} />
          </div>
          <Down />

          <FlowStep id="review-worker" color="purple" icon="⏰"
            title="review_worker" sub="every 30s · picks pending articles"
            wide {...stepProps}
          />
          <Down />

          <FlowStep id="claude-review" color="purple" icon="🤖"
            title="Claude Haiku AI Review" sub="rewrite · score · SEO · translate · image"
            wide {...stepProps}
          />

          {/* Score decision */}
          <Diamond
            id="score-gate"
            title="ai_score ≥ threshold?"
            sub="PlatformSettings: ai_review_threshold"
            onSelect={sel} selected={selected}
          />
          <div className="flex gap-1 my-0.5">
            <SecMini secId="sec-jwt"  onSelect={sel} selected={selected} />
            <SecMini secId="sec-rbac" onSelect={sel} selected={selected} />
          </div>

          {/* Two branches */}
          <div className="flex items-start gap-8 mt-2">
            {/* Auto-publish */}
            <div className="flex flex-col items-center">
              <div className={`text-[10px] font-semibold mb-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                Yes ✓ auto-publish
              </div>
              <Down />
              <FlowStep id="auto-published" color="green" icon="✅" title="published" sub="auto-published" {...stepProps} />
              <Down />
              <FlowStep id="site-renderer" color="sky" icon="🖥️" title="Site Renderer" sub="port 5174+ · VITE_SITE_ID" {...stepProps} />
              <Down />
              <FlowStep id="public-site" color="green" icon="🏠" title="Public Site" sub="template A–E · RTL-aware" {...stepProps} />
            </div>

            {/* Human review */}
            <div className="flex flex-col items-center">
              <div className={`text-[10px] font-semibold mb-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                No ✗ human review
              </div>
              <Down />
              <FlowStep id="stays-pending" color="amber" icon="🕐" title="stays pending" sub="score &lt; threshold" {...stepProps} />
              <Down />
              <FlowStep id="cms-review" color="indigo" icon="📋" title="CMS · Review app" sub="port 5173 · editor/admin" {...stepProps} />
              <div className="flex gap-1 my-0.5">
                <SecMini secId="sec-jwt"  onSelect={sel} selected={selected} />
                <SecMini secId="sec-rbac" onSelect={sel} selected={selected} />
              </div>
              <Down label="approve or reject" />
              <div className="flex items-start gap-3 mt-1">
                <Node color="green" icon="✅" title="published" sub="PATCH status=published" />
                <Node color="red"   icon="🗑️" title="removed"   sub="PATCH status=removed" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step detail panel — expands below the diagram */}
      {selected && (
        <StepDetail stepId={selected} onClose={() => setSelected(null)} />
      )}

      {/* ── Trends Sub-flow Bar (horizontal) ── */}
      <div className={`mt-8 rounded-2xl border-2 p-4 overflow-x-auto
        ${isDark ? 'border-sky-800 bg-sky-950/30' : 'border-sky-200 bg-sky-50/60'}`}
      >
        <div className={`text-[10px] font-bold uppercase tracking-widest mb-3
          ${isDark ? 'text-sky-400' : 'text-sky-600'}`}
        >
          Trends Pipeline
        </div>
        <div className="flex items-center gap-1 min-w-max flex-wrap">
          <FlowStep id="google-trends-rss" color="sky" icon="📡"
            title="Google Trends RSS" sub="RSS feed · no API key"
            {...stepProps}
          />
          <Right />
          <FlowStep id="trends-worker" color="sky" icon="⏰"
            title="trends_worker" sub="interval from PlatformSettings"
            {...stepProps}
          />
          <Right />
          <FlowStep id="trend-rows-db" color="blue" icon="📊"
            title="Trend rows (DB)" sub="keyword · region · status: new"
            {...stepProps}
          />
          <Right />
          <FlowStep id="admin-trends" color="indigo" icon="🖥️"
            title="Admin → Trends" sub="Trending + Explore tabs"
            {...stepProps}
          />
          <Right />
          {/* Outcomes */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <Node color="gray" icon="🚫" title="Dismiss" sub="status: dismissed" />
            </div>
            <div className="flex items-center gap-1">
              <FlowStep id="claude-site-config" color="green" icon="🤖"
                title="Claude Haiku" sub="site config"
                {...stepProps}
              />
              <Right />
              <FlowStep id="site-created" color="green" icon="🌐"
                title="Site + ScrapeJob" sub="status: used"
                {...stepProps}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Security layer (interactive nodes) ── */}
      <div className={`mt-6 rounded-2xl border-2 p-4
        ${isDark ? 'border-red-900 bg-red-950/20' : 'border-red-100 bg-red-50/50'}`}
      >
        <div className={`text-[10px] font-bold uppercase tracking-widest mb-3
          ${isDark ? 'text-red-400' : 'text-red-500'}`}
        >
          Security Layer — click any control for details
        </div>
        <div className="flex flex-wrap gap-2 justify-start">
          {[
            { id: 'sec-ssrf',      icon: '🛡️', title: 'SSRF Protection',       sub: 'scraper.py' },
            { id: 'sec-jwt',       icon: '🔐', title: 'JWT Auth',               sub: 'security/auth.py' },
            { id: 'sec-xss',       icon: '🧹', title: 'XSS Sanitizer',          sub: 'utils/sanitize.py' },
            { id: 'sec-bcrypt',    icon: '🔑', title: 'bcrypt Passwords',        sub: 'security/auth.py' },
            { id: 'sec-rbac',      icon: '👤', title: 'Role-Based Access',       sub: 'security/permissions.py' },
            { id: 'sec-pydantic',  icon: '✅', title: 'Input Validation',        sub: 'app/schemas/' },
            { id: 'sec-ratelimit', icon: '⏱️', title: 'Per-Domain Rate Limit',   sub: 'scraper.py' },
            { id: 'sec-sqli',      icon: '🗄️', title: 'SQL Injection Guard',     sub: 'SQLAlchemy ORM' },
          ].map(({ id, icon, title, sub }) => (
            <FlowStep
              key={id}
              id={id}
              color="red"
              icon={icon}
              title={title}
              sub={sub}
              {...stepProps}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Architecture tab (6 layers)
// ---------------------------------------------------------------------------

function ArchTab() {
  const { isDark } = useTheme()

  const routeStyle = isDark
    ? 'text-[10px] bg-indigo-950/60 border border-indigo-800 rounded px-2 py-0.5 text-indigo-300 font-mono leading-relaxed'
    : 'text-[10px] bg-white border border-indigo-100 rounded px-2 py-0.5 text-indigo-700 font-mono leading-relaxed'

  const svcStyle = isDark
    ? 'bg-indigo-950/60 border border-indigo-800 rounded px-2 py-1'
    : 'bg-white border border-indigo-100 rounded px-2 py-1'

  const svcName = isDark ? 'text-[10px] font-mono font-semibold text-indigo-300' : 'text-[10px] font-mono font-semibold text-indigo-700'
  const svcDesc = isDark ? 'text-[9px] text-indigo-400 leading-tight' : 'text-[9px] text-indigo-400 leading-tight'

  const skyItem = isDark
    ? 'text-[10px] bg-sky-950/60 border border-sky-800 rounded px-1.5 py-0.5 text-sky-300 mb-1 leading-snug'
    : 'text-[10px] bg-white border border-sky-100 rounded px-1.5 py-0.5 text-sky-800 mb-1 leading-snug'

  const greenItem = isDark
    ? 'text-[10px] bg-emerald-950/60 border border-emerald-800 rounded px-2 py-0.5 text-emerald-300'
    : 'text-[10px] bg-white border border-emerald-100 rounded px-2 py-0.5 text-emerald-800'

  const dbCard = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-center shadow-sm'
    : 'bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-center shadow-sm'

  return (
    <div className="space-y-3 max-w-4xl mx-auto py-2">

      {/* 1 — External services */}
      <LayerBox label="1 · External Services" color="amber">
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            { icon: '🔍', title: 'Tavily',            sub: '~$0.004/search · TAVILY_API_KEY' },
            { icon: '🔎', title: 'Google CSE',        sub: 'free ≤100/day · $5/1K after' },
            { icon: '🤖', title: 'Anthropic',         sub: '$0.25/1M in · $1.25/1M out (Haiku)' },
            { icon: '📷', title: 'Unsplash',          sub: 'free demo · 50 req/hour limit' },
            { icon: '🎨', title: 'Stability AI',      sub: '~$0.04/logo · optional key' },
            { icon: '📡', title: 'Google Trends RSS', sub: 'free · no API key required' },
          ].map(n => <Node key={n.title} color="amber" {...n} />)}
        </div>
      </LayerBox>

      <LayerArrow />

      {/* 2 — Backend */}
      <LayerBox label="2 · Backend · FastAPI · port 8000" color="indigo">
        <div className="grid grid-cols-3 gap-4">

          {/* Routes */}
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-400'}`}>Routes</div>
            <div className="space-y-1">
              {[
                '/auth (register · login · me)',
                '/sites (CRUD)',
                '/cms/articles (CRUD · stats)',
                '/cms/categories (CRUD)',
                '/scraper/jobs (CRUD · run)',
                '/trends (list · fetch)',
                '/trends/settings',
                '/trends/explore (pytrends)',
                '/trends/{id}/create-site',
                '/settings (CRUD — admin)',
                '/public/* (unauthenticated)',
                '/admin/users',
                '/admin/images/audit',
                '/admin/api-usage (cost dashboard)',
                '/admin/alerts (CRUD · bulk-delete · test)',
                '/admin/docs/{filename}   # docs viewer',
                '/analytics (track · read)',
              ].map(r => <div key={r} className={routeStyle}>{r}</div>)}
            </div>
          </div>

          {/* Services + Workers */}
          <div className="space-y-4">
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-400'}`}>Services</div>
              <div className="space-y-1">
                {[
                  ['scraper.py',         'Tavily + CSE → HTML fetch → Article'],
                  ['ai_review.py',       'Claude Haiku tool_use → rewrite + score'],
                  ['image_service.py',   'Unsplash · per_page=10 · excluded_urls dedup'],
                  ['image_validator.py', 'HEAD-check · noise RE · trusted-CDN fast-path'],
                  ['logo_service.py',    'Stability AI SDXL 1536×640 · SVG fallback'],
                  ['trends_service.py',  'RSS fetch · pytrends explore · AI config'],
                  ['usage_service.py',   'log_api_call() · fire-and-forget · all 6 services'],
                  ['log_analyzer.py',    'DB + api_log rules → alert dicts · cooldown tracking'],
                  ['settings_service.py','in-memory cache · typed key-value'],
                ].map(([name, desc]) => (
                  <div key={name} className={svcStyle}>
                    <div className={svcName}>{name}</div>
                    <div className={svcDesc}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-400'}`}>Background Workers</div>
              <div className="space-y-1">
                {[
                  ['scrape_worker',  'interval from PlatformSettings — runs due ScrapeJobs'],
                  ['review_worker',  'interval from PlatformSettings — AI reviews pending'],
                  ['trends_worker',  'interval from PlatformSettings — fetches trends'],
                  ['image_worker',   'startup + interval from PlatformSettings — validates images'],
                  ['alert_worker',   '5m fixed interval — analyze_logs() → Alert rows'],
                ].map(([name, desc]) => (
                  <div key={name} className={svcStyle}>
                    <div className={svcName}>{name}</div>
                    <div className={svcDesc}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Security + Stack */}
          <div className="space-y-4">
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-400'}`}>Security</div>
              <div className="flex flex-wrap gap-1">
                {[
                  'JWT + bcrypt auth',
                  'Role-based access (admin·editor·viewer)',
                  'SSRF protection (RFC-1918 block)',
                  'HTML sanitizer (XSS denylist)',
                  'Schema-only migrations (Alembic)',
                  'Pydantic v2 request validation',
                ].map(s => <SecurityBadge key={s} label={s} />)}
              </div>
            </div>
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-indigo-400' : 'text-indigo-400'}`}>Stack</div>
              <div className="flex flex-wrap gap-1">
                {['FastAPI', 'SQLAlchemy', 'Alembic', 'Pydantic v2', 'httpx', 'BeautifulSoup', 'pytrends', 'anthropic', 'PyJWT', 'bcrypt'].map(t => (
                  <TechPill key={t} label={t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </LayerBox>

      <LayerArrow />

      {/* 🔒 Security Layer */}
      <LayerBox
        label="🔒 Security Layer — cross-cutting protections applied across all backend routes and services"
        color="red"
        collapsible
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              icon: '🛡️', name: 'SSRF Protection',
              file: 'app/services/scraper.py — validate_url()',
              protects: 'Blocks requests to RFC-1918 (10.x, 192.168.x, 172.16–31.x), loopback, and IPv6 link-local/ULA before any network call. Scheme whitelisted to http/https only.',
            },
            {
              icon: '🔐', name: 'JWT Authentication',
              file: 'app/security/auth.py — create/decode_access_token',
              protects: 'Signs tokens with HS256 + SECRET_KEY from env. Algorithm pinned — "none" algorithm attack impossible. Expiry enforced; expired tokens return 401 before route handler runs.',
            },
            {
              icon: '🧹', name: 'XSS Sanitizer',
              file: 'app/utils/sanitize.py — sanitize_html()',
              protects: 'Denylist strips <script>, <iframe>, <svg>, <math>, <meta>, <template>, event handlers (on*), javascript: URLs, and srcdoc attributes from all scraped content_html before DB write.',
            },
            {
              icon: '🔑', name: 'bcrypt Passwords',
              file: 'app/security/auth.py — hash_password / verify_password',
              protects: 'All passwords hashed with bcrypt (passlib, 12 rounds) — plain text never stored or logged. Login uses constant-time passlib.verify to prevent timing-based enumeration.',
            },
            {
              icon: '👤', name: 'Role-Based Access',
              file: 'app/security/permissions.py — require_admin / require_editor',
              protects: 'Three roles: admin, editor, viewer. Enforced server-side on every request via route dependencies. Self-registration is hard-coded to viewer regardless of request body.',
            },
            {
              icon: '✅', name: 'Input Validation',
              file: 'app/schemas/ — Pydantic v2 on every route',
              protects: 'Type, length, and enum constraints validated before any business logic runs. FastAPI returns structured 422 Unprocessable Entity with field-level errors on any mismatch.',
            },
            {
              icon: '⏱️', name: 'Per-Domain Rate Limit',
              file: 'app/services/scraper.py — _last_fetch_time dict',
              protects: '2-second minimum gap between successive requests to the same hostname. Prevents the scraper from hammering news sources and reduces IP-block risk during bulk scrape runs.',
            },
            {
              icon: '🗄️', name: 'SQL Injection Guard',
              file: 'SQLAlchemy ORM — all services and routes',
              protects: 'All DB queries use ORM methods with bound parameters. No raw SQL string interpolation found anywhere. SQLAlchemy passes all values as parameterized placeholders.',
            },
          ].map(({ icon, name, file, protects }) => (
            <div
              key={name}
              className={`rounded-xl px-3 py-2.5 border
                ${isDark ? 'bg-red-950/40 border-red-800' : 'bg-white border-red-100'}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm">{icon}</span>
                <span className={`text-[10px] font-semibold leading-tight ${isDark ? 'text-red-300' : 'text-red-700'}`}>{name}</span>
              </div>
              <div className={`text-[9px] font-mono mb-1.5 leading-snug ${isDark ? 'text-red-500' : 'text-red-400'}`}>{file}</div>
              <div className={`text-[9px] leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{protects}</div>
            </div>
          ))}
        </div>
      </LayerBox>

      <LayerArrow />

      {/* 3 — Platform Settings */}
      <LayerBox label="3 · Platform Settings — admin-configurable runtime parameters" color="purple">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>
              Settings (21 keys)
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[
                ['ai_review_threshold',            'float · auto-publish gate'],
                ['auto_publish_enabled',           'bool · master switch'],
                ['max_searches_per_job',           'int · scraper URL limit'],
                ['min_paragraph_blocks',           'int · quality gate'],
                ['min_word_count',                 'int · quality gate'],
                ['trends_fetch_interval_hours',    'int · trends worker sleep'],
                ['trends_auto_site_limit',         'int · site-creation cap'],
                ['trends_auto_site_threshold',     'float · score gate (enforced)'],
                ['admin_theme_default',            'string · light | dark'],
                ['scraper_tavily_max_results',     'int · Tavily results/job'],
                ['scraper_google_max_results',     'int · Google CSE results/job'],
                ['scrape_worker_interval_seconds', 'int · scrape loop sleep'],
                ['ai_review_input_char_limit',     'int · article truncation'],
                ['ai_review_max_tokens',           'int · Claude output cap'],
                ['default_images_per_site',        'int · curated image slots'],
                ['image_max_candidate_pages',      'int · Unsplash pages tried'],
                ['image_worker_interval_hours',    'int · image worker sleep'],
                ['image_audit_max_articles',       'int · audit run ceiling'],
                ['trends_per_region',              'int · trends per region'],
                ['trends_default_scrape_freq_m',   'int · new site job frequency'],
                ['review_worker_interval_seconds', 'int · review loop sleep'],
              ].map(([key, desc]) => (
                <div key={key} className={`rounded px-2 py-1 ${isDark ? 'bg-purple-950/50 border border-purple-800' : 'bg-white border border-purple-100'}`}>
                  <div className={`text-[9px] font-mono font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{key}</div>
                  <div className={`text-[9px] ${isDark ? 'text-purple-400' : 'text-purple-400'}`}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>
                Architecture
              </div>
              {[
                ['DB-backed', 'platform_settings table (SQLite → Postgres)'],
                ['In-memory cache', 'threading.Lock · lazy-loaded on first get()'],
                ['Typed values', 'float / int / bool / string — cast at read time'],
                ['Idempotent seed', 'seed_defaults() at startup — safe to restart'],
                ['Hot-reload', 'set_value() invalidates cache — no restart needed'],
              ].map(([name, desc]) => (
                <div key={name} className={`rounded px-2 py-1.5 ${isDark ? 'bg-purple-950/50 border border-purple-800' : 'bg-white border border-purple-100'}`}>
                  <div className={`text-[10px] font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{name}</div>
                  <div className={`text-[9px] ${isDark ? 'text-purple-400' : 'text-purple-400'}`}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </LayerBox>

      <LayerArrow />

      {/* 4 — Frontend */}
      <div className="grid grid-cols-2 gap-3">

        {/* Admin / CMS / Review */}
        <LayerBox label="4a · Admin · CMS · Review — port 5173" color="sky">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              {
                group: 'Admin',
                items: ['Dashboard', 'Sites', 'Scrape Jobs', 'Trends', 'Users', 'Architecture', 'Settings ⚙️', 'API Costs 💰', 'Alerts 🔔'],
              },
              {
                group: 'CMS',
                items: ['Articles', 'Article Editor', 'Categories'],
              },
              {
                group: 'Review',
                items: ['Queue', 'Preview Modal', 'Approve / Reject'],
              },
            ].map(({ group, items }) => (
              <div key={group}>
                <div className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-sky-400' : 'text-sky-500'}`}>
                  {group}
                </div>
                {items.map(item => (
                  <div key={item} className={skyItem}>{item}</div>
                ))}
              </div>
            ))}
          </div>
          <div className={`mt-2 text-[9px] leading-snug ${isDark ? 'text-sky-400' : 'text-sky-500'}`}>
            <span className="font-semibold">Shared health components:</span>{' '}
            HealthThermometer (14×40px SVG · 4 severity levels · pulse animation) +
            AlertBell (unread badge · dropdown · mark-read · bulk-delete) —
            present in all 3 layout headers; thermometer hides on 403 for non-admin.
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {['React', 'Vite', 'react-query', 'axios', 'recharts', 'TipTap', 'JWT → localStorage', 'ThemeContext'].map(t => (
              <TechPill key={t} label={t} />
            ))}
          </div>
        </LayerBox>

        {/* Site Renderer */}
        <LayerBox label="4b · Site Renderer — port 5174+" color="green">
          <div className="space-y-2 mb-2">
            <div>
              <div className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`}>
                Templates
              </div>
              <div className="flex flex-wrap gap-1">
                {['A — Newspaper', 'B — Magazine', 'C — Blog', 'D — Cards', 'E — Sidebar'].map(t => (
                  <div key={t} className={greenItem}>{t}</div>
                ))}
              </div>
            </div>
            <div>
              <div className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`}>
                Features
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  'RTL support (he · ar)',
                  'Per-site brand colors',
                  'VITE_SITE_ID env var',
                  'SiteContext (articles + cats)',

                  'Default image fallbacks',
                  '/public/* API (no auth)',
                  'getDefaultImage() utility',
                  'Pinned articles first',
                  'Sticky headers A/D/E',
                  'Hero ≥60vh (B — no clip)',
                ].map(f => (
                  <div key={f} className={`${greenItem} leading-snug`}>{f}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {['React', 'Vite', 'tailwindcss-rtl', 'react-router'].map(t => (
              <TechPill key={t} label={t} />
            ))}
          </div>
        </LayerBox>
      </div>

      <LayerArrow />

      {/* 5 — Database */}
      <LayerBox label="5 · Database — SQLite (dev) · Postgres-ready (prod)" color="gray">
        <div className="flex flex-wrap gap-2 justify-center mb-2">
          {[
            { name: 'User',            desc: 'auth · bcrypt · roles' },
            { name: 'Site',            desc: 'domain · template · config JSON' },
            { name: 'Category',        desc: 'per-site · URL slug' },
            { name: 'Article',         desc: 'content_html · ai_score · SEO · pinned' },
            { name: 'ScrapeJob',       desc: 'keywords · frequency · status' },
            { name: 'Analytics',       desc: 'page-view events · site/article' },
            { name: 'Trend',           desc: 'keyword · region · score · site_id FK' },
            { name: 'AppSetting',      desc: 'key-value · trends_fetch_region' },
            { name: 'PlatformSetting', desc: 'typed key-value · updated_by · cache' },
            { name: 'ApiUsageLog',     desc: 'per-call telemetry · 6 services · cost' },
            { name: 'Alert',           desc: 'level · source · is_read · log_analyzer' },
          ].map(({ name, desc }) => (
            <div key={name} className={dbCard}>
              <div className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{name}</div>
              <div className={`text-[9px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{desc}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 justify-center">
          {['SQLAlchemy ORM', 'Alembic migrations', 'render_as_batch=True (SQLite)', 'DATABASE_URL env var'].map(t => (
            <TechPill key={t} label={t} />
          ))}
        </div>
      </LayerBox>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guidelines tab — reference cards for all project guidance systems
// ---------------------------------------------------------------------------

const SLASH_COMMANDS = [
  { name: '/scrape',           desc: 'Trigger a scrape job; shows new articles and auto-publish results' },
  { name: '/review',           desc: 'Show pending articles by site/score; approve or reject interactively' },
  { name: '/newsite',          desc: 'Guided wizard: create site, scrape job, and renderer config' },
  { name: '/stats',            desc: 'Full platform statistics: articles, scores, job status, analytics' },
  { name: '/deploy',           desc: 'AWS deployment checklist and status assessment' },
  { name: '/trends',           desc: "Show today's trending topics by region; dismiss or create sites" },
  { name: '/api-costs',        desc: 'Cost summary from api_usage_log — per-service spend this month' },
  { name: '/refactor',         desc: 'Scan frontend/src/ for duplicate components; auto-refactor on confirm' },
  { name: '/check-alerts',     desc: 'Live alert health check — thermometer status, grouped table, fix suggestions' },
  { name: '/run-log-analysis', desc: 'Trigger an immediate on-demand log analysis cycle; show rule-by-rule results' },
  { name: '/clear-alerts',     desc: 'Delete alerts by level (all/info/warning/critical); confirms before clearing criticals' },
]

const SKILLS = [
  { name: '/code-review',      desc: 'Scan changed files for quality and security issues; report by severity; auto-fix critical' },
  { name: '/doc-sync',         desc: 'Sync CLAUDE.md, REVIEW.md, Architecture.jsx, and commands to match current code' },
  { name: '/image-fix',        desc: '/image-fix [site_id] — fix missing/broken/duplicate/off-topic article images via Unsplash' },
  { name: '/session-handoff',  desc: 'End-of-session wrap-up: verify rules, ensure git clean, update Last Session Summary' },
]

function GuidelinesTab() {
  const { isDark } = useTheme()
  const [viewingDoc, setViewingDoc] = useState(null)  // null | 'CLAUDE.md' | 'REVIEW.md'

  const { data: docData, isLoading: docLoading, isError: docError } = useQuery({
    queryKey: ['admin-doc', viewingDoc],
    queryFn:  () => api.get(`/admin/docs/${viewingDoc}`).then(r => r.data),
    enabled:  !!viewingDoc,
    staleTime: 5 * 60_000,
  })

  const card = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-2xl p-4 shadow-sm'
    : 'bg-white border border-gray-200 rounded-2xl p-4 shadow-sm'
  const cardTitle  = isDark ? 'text-sm font-semibold text-gray-100'  : 'text-sm font-semibold text-gray-900'
  const cardDesc   = isDark ? 'text-xs text-gray-400 mt-1.5 leading-snug' : 'text-xs text-gray-500 mt-1.5 leading-snug'
  const pill       = isDark
    ? 'text-[10px] bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-gray-300 font-mono'
    : 'text-[10px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 font-mono'
  const viewBtn    = 'mt-3 text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors'

  return (
    <div className="max-w-4xl space-y-5">

      {/* Row 1 — Project docs */}
      <div className="grid grid-cols-2 gap-4">

        {/* CLAUDE.md */}
        <div className={card}>
          <div className="flex items-center gap-2">
            <span className="text-lg">📘</span>
            <span className={cardTitle}>CLAUDE.md</span>
            <span className={pill}>source of truth</span>
          </div>
          <p className={cardDesc}>
            Project source of truth — working rules, architecture overview, API reference,
            completed features, and next steps. Read fully before every task.
          </p>
          <button className={viewBtn} onClick={() => setViewingDoc('CLAUDE.md')}>
            View →
          </button>
        </div>

        {/* REVIEW.md */}
        <div className={card}>
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <span className={cardTitle}>REVIEW.md</span>
            <span className={pill}>audit log</span>
          </div>
          <p className={cardDesc}>
            Running code review log — security findings, technical debt, and session audit
            notes appended after every Claude Code session (Working Rule 2).
          </p>
          <button className={viewBtn} onClick={() => setViewingDoc('REVIEW.md')}>
            View →
          </button>
        </div>
      </div>

      {/* Row 2 — Slash commands + Skills */}
      <div className="grid grid-cols-2 gap-4">

        {/* Commands */}
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚡</span>
            <span className={cardTitle}>.claude/commands/</span>
            <span className={pill}>11 commands</span>
          </div>
          <p className={cardDesc}>
            Custom Claude Code slash commands — invoke with /name at the start of any session.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {SLASH_COMMANDS.map(({ name, desc }) => (
              <div
                key={name}
                className={`rounded-lg px-2.5 py-2
                  ${isDark ? 'bg-gray-900 border border-gray-700' : 'bg-gray-50 border border-gray-100'}`}
              >
                <div className={`text-xs font-mono font-semibold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                  {name}
                </div>
                <div className={`text-[10px] mt-0.5 leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔧</span>
            <span className={cardTitle}>.claude/skills/</span>
            <span className={pill}>4 skills</span>
          </div>
          <p className={cardDesc}>
            Reusable automation skills — invoke with /skill-name. Use instead of writing ad-hoc instructions (Working Rule 13).
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {SKILLS.map(({ name, desc }) => (
              <div
                key={name}
                className={`rounded-lg px-2.5 py-2
                  ${isDark ? 'bg-gray-900 border border-indigo-800' : 'bg-indigo-50/50 border border-indigo-100'}`}
              >
                <div className={`text-xs font-mono font-semibold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                  {name}
                </div>
                <div className={`text-[10px] mt-0.5 leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {desc}
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-3 text-[10px] leading-snug ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Hooks: <span className={`font-mono ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>pre-task.md · post-task.md · pre-commit.md</span> — follow these before/after every task and commit.
          </div>
        </div>

      </div>

      {/* Row 3 — Config systems */}
      <div className="grid grid-cols-3 gap-4">

        {/* backend/.env */}
        <div className={card}>
          <div className="flex items-center gap-2">
            <span className="text-lg">🔑</span>
            <span className={cardTitle}>backend/.env</span>
          </div>
          <p className={cardDesc}>
            Secret environment variables — API keys, DATABASE_URL, SECRET_KEY, and all
            service credentials.  Never committed to git.
          </p>
          <div className={`mt-3 inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 font-medium
            ${isDark ? 'bg-amber-900/40 border border-amber-700 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
            ⚠️ not viewable — security
          </div>
        </div>

        {/* config.py */}
        <div className={card}>
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <span className={cardTitle}>app/config.py</span>
          </div>
          <p className={cardDesc}>
            Pydantic Settings class — declares all env var names, types, and defaults.
            Update here whenever a new environment variable is added (Working Rule 3).
          </p>
          <div className={`mt-3 inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 font-medium
            ${isDark ? 'bg-sky-900/40 border border-sky-700 text-sky-300' : 'bg-sky-50 border border-sky-200 text-sky-700'}`}>
            infrastructure config
          </div>
        </div>

        {/* PlatformSettings */}
        <div className={card}>
          <div className="flex items-center gap-2">
            <span className="text-lg">🗄️</span>
            <span className={cardTitle}>PlatformSettings</span>
          </div>
          <p className={cardDesc}>
            Runtime-editable parameters in the platform_settings DB table — 21 keys across
            6 groups.  Editable without server restart via the Settings page.
          </p>
          <Link
            to="/admin/settings"
            className="mt-3 block text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
          >
            Go to Settings →
          </Link>
        </div>
      </div>

      {/* Row 4 — Security Guidelines */}
      <div className={card}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔒</span>
            <span className={cardTitle}>Security Guidelines</span>
            <span className={pill}>8 invariants</span>
          </div>
          <button
            className="text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
            onClick={() => setViewingDoc('REVIEW.md')}
          >
            View REVIEW.md →
          </button>
        </div>
        <p className={cardDesc}>
          Security invariants confirmed safe in the last audit (2026-03-16). All new routes must
          satisfy these checks before merging — Working Rule 2 mandates a security review after
          every session.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { icon: '🔐', name: 'JWT "none" attack',  detail: 'algorithms=[settings.algorithm] — algorithm pinned to HS256; "none" bypass structurally impossible' },
            { icon: '🔑', name: 'API key exposure',   detail: 'All keys via pydantic-settings from .env — never hardcoded, never logged, never returned to frontend' },
            { icon: '🛡️', name: 'SSRF',               detail: 'validate_url() resolves hostname; blocks RFC-1918, loopback, link-local IPv6 before any HTTP call' },
            { icon: '🗄️', name: 'SQL injection',      detail: 'SQLAlchemy ORM parameterized queries throughout — zero raw SQL string interpolation found' },
            { icon: '🌐', name: 'CORS',                detail: 'Locked to localhost:5173–5177 in dev — add production domains to allow_origins before deploying' },
            { icon: '🔒', name: 'Auth coverage',       detail: 'All non-public routes use get_current_user / require_admin / require_editor dependency' },
            { icon: '⚙️', name: 'Worker safety',       detail: 'Inner loops wrapped in try/except Exception + logger.exception — one bad article cannot crash workers' },
            { icon: '👤', name: 'Self-registration',   detail: 'Role forced to viewer on POST /auth/register — request body role field is silently overridden' },
          ].map(({ icon, name, detail }) => (
            <div
              key={name}
              className={`rounded-lg px-2.5 py-2
                ${isDark ? 'bg-gray-900 border border-gray-700' : 'bg-red-50/50 border border-red-100'}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span>{icon}</span>
                <span className={`text-xs font-semibold ${isDark ? 'text-red-300' : 'text-red-700'}`}>{name}</span>
              </div>
              <div className={`text-[10px] leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{detail}</div>
            </div>
          ))}
        </div>
        <div className={`mt-3 inline-flex items-center gap-1.5 text-[10px] rounded px-2 py-1
          ${isDark ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
          ✅ Last audit: 2026-03-16 · Rating: GOOD with well-understood gaps · Open issues: R1 (rate limiting) · R2 (DOMPurify) · R3 (CORS prod)
        </div>
      </div>

      {/* Doc viewer modal */}
      {viewingDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setViewingDoc(null)}
        >
          <div
            className={`w-full max-w-4xl h-[80vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl
              ${isDark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0
              ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{viewingDoc === 'CLAUDE.md' ? '📘' : '🔍'}</span>
                <span className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  {viewingDoc}
                </span>
              </div>
              <button
                onClick={() => setViewingDoc(null)}
                className={`text-xs font-medium px-2 py-1 rounded transition-colors
                  ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                ✕ Close
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {docLoading && (
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</p>
              )}
              {docError && (
                <p className="text-sm text-red-500">Failed to load file. Is the backend running?</p>
              )}
              {docData && (
                <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-mono
                  ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                >
                  {docData.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standards tab — global and project config reference
// ---------------------------------------------------------------------------

// Global ~/.claude/ files
const GLOBAL_CONFIG_FILES = [
  {
    icon: '📘', title: 'CLAUDE.md', path: 'CLAUDE.md',
    desc: 'Universal working rules, code quality standards, security invariants, and available skills. Loaded automatically in every Claude Code session.',
  },
  {
    icon: '⚡', title: 'commands/new-project.md', path: 'commands/new-project.md',
    desc: 'Guided wizard: create CLAUDE.md, REVIEW.md, .claude/ structure, and initial commit for any new project.',
  },
  {
    icon: '🔧', title: 'commands/code-review.md', path: 'commands/code-review.md',
    desc: 'Invoke /code-review to scan changed files, report by severity, and auto-fix critical issues.',
  },
  {
    icon: '📄', title: 'commands/doc-sync.md', path: 'commands/doc-sync.md',
    desc: 'Invoke /doc-sync to sync CLAUDE.md, review log, architecture diagram, and commands to current code.',
  },
  {
    icon: '🖼️', title: 'commands/image-fix.md', path: 'commands/image-fix.md',
    desc: 'Invoke /image-fix [site_id] to scan and fix missing/broken/duplicate/off-topic article images.',
  },
  {
    icon: '🤝', title: 'commands/session-handoff.md', path: 'commands/session-handoff.md',
    desc: 'Invoke /session-handoff to verify rules, clean up git, and print a ready-for-next-session handoff block.',
  },
  {
    icon: '🔔', title: 'commands/check-alerts.md', path: 'commands/check-alerts.md',
    desc: 'Invoke /check-alerts to perform a live alert health check: thermometer status, grouped table, fix suggestions.',
  },
  {
    icon: '🔍', title: 'commands/run-log-analysis.md', path: 'commands/run-log-analysis.md',
    desc: 'Invoke /run-log-analysis to trigger an immediate on-demand analysis cycle and show rule-by-rule results.',
  },
  {
    icon: '🧹', title: 'commands/clear-alerts.md', path: 'commands/clear-alerts.md',
    desc: 'Invoke /clear-alerts [level] to delete alerts by level; confirms before clearing criticals.',
  },
  {
    icon: '▶', title: 'commands/pre-task.md', path: 'commands/pre-task.md',
    desc: 'Invoke /pre-task to run the pre-task checklist: read CLAUDE.md, check git, state task context aloud.',
  },
  {
    icon: '✅', title: 'commands/post-task.md', path: 'commands/post-task.md',
    desc: 'Invoke /post-task to run the post-task checklist: code review, security check, doc sync, commit.',
  },
  {
    icon: '🔒', title: 'commands/pre-commit.md', path: 'commands/pre-commit.md',
    desc: 'Invoke /pre-commit to run the commit checklist: no secrets, no stubs, auth on all routes, migrations exist.',
  },
  {
    icon: '🪝', title: 'hooks/pre-task.md', path: 'hooks/pre-task.md',
    desc: 'Pre-task hook instructions: read project context, check git state, classify risk level.',
  },
  {
    icon: '🪝', title: 'hooks/post-task.md', path: 'hooks/post-task.md',
    desc: 'Post-task hook instructions: code review, security check, update docs, commit and push.',
  },
  {
    icon: '🪝', title: 'hooks/pre-commit.md', path: 'hooks/pre-commit.md',
    desc: 'Pre-commit hook instructions: full 11-point checklist for security, quality, and docs.',
  },
  {
    icon: '🔧', title: 'skills/code-review.md', path: 'skills/code-review.md',
    desc: 'Code review skill: per-language check tables, severity definitions, auto-fix rules.',
  },
  {
    icon: '📄', title: 'skills/doc-sync.md', path: 'skills/doc-sync.md',
    desc: 'Doc sync skill: step-by-step CLAUDE.md, review log, architecture, and commands sync procedure.',
  },
  {
    icon: '🖼️', title: 'skills/image-fix.md', path: 'skills/image-fix.md',
    desc: 'Image fix skill: classification table, Unsplash search strategy, dedup logic, fix queue.',
  },
  {
    icon: '🤝', title: 'skills/session-handoff.md', path: 'skills/session-handoff.md',
    desc: 'Session handoff skill: rule verification, git clean check, Last Session Summary update, handoff block.',
  },
]

// Project .claude/ files (this project)
const PROJECT_CONFIG_FILES = [
  {
    icon: '🪝', title: 'hooks/pre-task.md', path: 'hooks/pre-task.md',
    desc: 'Project pre-task hook: reads CLAUDE.md + REVIEW.md last section, git status, states task context with risk classification.',
  },
  {
    icon: '🪝', title: 'hooks/post-task.md', path: 'hooks/post-task.md',
    desc: '7-step post-task checklist: code review → security check → update 4 docs → commit → push.',
  },
  {
    icon: '🪝', title: 'hooks/pre-commit.md', path: 'hooks/pre-commit.md',
    desc: '8-point pre-commit checklist with shell commands for secret detection, empty-file checks, auth coverage, and migration verification.',
  },
  {
    icon: '🔧', title: 'skills/code-review.md', path: 'skills/code-review.md',
    desc: 'Project-tuned code review skill for FastAPI + React: Python and JSX check tables, critical auto-fix rules.',
  },
  {
    icon: '📄', title: 'skills/doc-sync.md', path: 'skills/doc-sync.md',
    desc: 'Project doc sync: CLAUDE.md (11 sections), REVIEW.md, Architecture.jsx (7 layers), .claude/commands/ (11 files).',
  },
  {
    icon: '🖼️', title: 'skills/image-fix.md', path: 'skills/image-fix.md',
    desc: 'Project image fix: site_id parameter, Unsplash API via UNSPLASH_ACCESS_KEY, site.config.default_images fallback.',
  },
  {
    icon: '🤝', title: 'skills/session-handoff.md', path: 'skills/session-handoff.md',
    desc: 'Project session handoff: verifies all 13 Working Rules, updates Last Session Summary, prints structured handoff block.',
  },
  {
    icon: '⚡', title: 'commands/scrape.md', path: 'commands/scrape.md',
    desc: '/scrape — trigger a scrape job by ID; show new articles summary and auto-publish results.',
  },
  {
    icon: '⚡', title: 'commands/review.md', path: 'commands/review.md',
    desc: '/review — show pending articles by site/score; approve or reject interactively.',
  },
  {
    icon: '⚡', title: 'commands/newsite.md', path: 'commands/newsite.md',
    desc: '/newsite — guided wizard to create a new site, scrape job, and renderer config.',
  },
  {
    icon: '⚡', title: 'commands/stats.md', path: 'commands/stats.md',
    desc: '/stats — full platform statistics: articles, scores, job status, analytics.',
  },
  {
    icon: '⚡', title: 'commands/deploy.md', path: 'commands/deploy.md',
    desc: '/deploy — AWS deployment checklist and status assessment.',
  },
  {
    icon: '⚡', title: 'commands/trends.md', path: 'commands/trends.md',
    desc: '/trends — show trending topics by region; dismiss or create sites from trends.',
  },
  {
    icon: '⚡', title: 'commands/api-costs.md', path: 'commands/api-costs.md',
    desc: '/api-costs — cost summary from api_usage_log — per-service spend this month.',
  },
  {
    icon: '⚡', title: 'commands/refactor.md', path: 'commands/refactor.md',
    desc: '/refactor — scan frontend/src/ for duplicate components; auto-refactor on confirmation.',
  },
  {
    icon: '🔔', title: 'commands/check-alerts.md', path: 'commands/check-alerts.md',
    desc: '/check-alerts — live alert health check: thermometer status, grouped table, per-source fix suggestions.',
  },
  {
    icon: '🔍', title: 'commands/run-log-analysis.md', path: 'commands/run-log-analysis.md',
    desc: '/run-log-analysis — trigger immediate on-demand log analysis cycle; rule-by-rule output.',
  },
  {
    icon: '🧹', title: 'commands/clear-alerts.md', path: 'commands/clear-alerts.md',
    desc: '/clear-alerts [level] — delete alerts by level; confirms before clearing criticals.',
  },
]

// Working rules data (color-coded by category)
const WORKING_RULES = [
  { n: 1,  cat: 'before-task',   title: 'Pre-task hook',           body: 'Follow .claude/hooks/pre-task.md before every task — read CLAUDE.md fully, check git status, state task context and risk level aloud.' },
  { n: 2,  cat: 'after-task',    title: 'Post-task hook',          body: 'Follow .claude/hooks/post-task.md after every task — code review, security check, update CLAUDE.md/REVIEW.md/Architecture.jsx/commands, commit and push. Architecture.jsx MUST reflect: (a) new service/worker, (b) new model, (c) new page/component, (d) new slash command, (e) new security measure. This is not optional.' },
  { n: 3,  cat: 'code-quality',  title: 'Env var discipline',      body: 'When adding env vars, update both config.py and .env. Document the key in CLAUDE.md environment section.' },
  { n: 4,  cat: 'code-quality',  title: 'Modular services',        body: 'One responsibility per service file. Never mix DB access, business logic, and external API calls in one function.' },
  { n: 5,  cat: 'code-quality',  title: 'Errors caught & logged',  body: 'All errors must be caught and logged. Background worker inner loops wrapped in try/except Exception + logger.exception().' },
  { n: 6,  cat: 'data-safety',   title: 'Auto-publish threshold',  body: 'Articles with ai_score < 0.5 stay pending for human review. Articles ≥ 0.5 are auto-published (when auto_publish_enabled=true).' },
  { n: 7,  cat: 'data-safety',   title: 'Soft-delete only',        body: 'Never hard-delete articles or sites. Use PATCH status=removed (articles) or is_active=false (sites). Hard DELETE is for test cleanup only.' },
  { n: 8,  cat: 'data-safety',   title: 'Never drop the DB',       body: 'Always use alembic upgrade head. Never call create_all or drop_all. Migration files must be committed alongside model changes.' },
  { n: 9,  cat: 'code-quality',  title: 'Reusability first',       body: 'Search before writing. Any component or utility used in 2+ places lives in components/ or services/. Changes to shared code tested across all consumers.' },
  { n: 10, cat: 'git',           title: 'Git discipline',          body: 'Commit after every feature/fix. Format: feat:/fix:/chore:/refactor:. Always push. Follow pre-commit.md before every commit. Never leave uncommitted changes.' },
  { n: 11, cat: 'code-quality',  title: 'Configuration discipline',body: 'Business-logic values → PlatformSettings (runtime, editable). Infrastructure constants (timeouts, limits) stay as code. No new hardcoded business logic.' },
  { n: 12, cat: 'code-quality',  title: 'No empty files',          body: 'Never create placeholder files, stub components, or empty docs. Every file must have real content immediately. Empty DOCS/ files are forbidden.' },
  { n: 13, cat: 'before-task',   title: 'Available skills',        body: 'Use /code-review, /doc-sync, /image-fix, /session-handoff instead of ad-hoc instructions. Invoke with /skill-name in any Claude Code session.' },
]

const RULE_COLORS = {
  'before-task':  { ring: 'ring-blue-400',   bg: 'bg-blue-500',   light: 'bg-blue-50 border-blue-200',   dark: 'bg-blue-950/40 border-blue-700',   num: 'text-blue-500',   ndark: 'text-blue-400'  },
  'after-task':   { ring: 'ring-green-400',  bg: 'bg-green-500',  light: 'bg-green-50 border-green-200', dark: 'bg-green-950/40 border-green-700', num: 'text-green-600',  ndark: 'text-green-400' },
  'code-quality': { ring: 'ring-purple-400', bg: 'bg-purple-500', light: 'bg-purple-50 border-purple-200', dark: 'bg-purple-950/40 border-purple-700', num: 'text-purple-600', ndark: 'text-purple-400' },
  'data-safety':  { ring: 'ring-red-400',    bg: 'bg-red-500',    light: 'bg-red-50 border-red-200',     dark: 'bg-red-950/40 border-red-700',     num: 'text-red-600',    ndark: 'text-red-400'   },
  'git':          { ring: 'ring-amber-400',  bg: 'bg-amber-500',  light: 'bg-amber-50 border-amber-200', dark: 'bg-amber-950/40 border-amber-700', num: 'text-amber-600',  ndark: 'text-amber-400' },
}

const NEW_PROJECT_STEPS = [
  { n: 1, icon: '💬', title: 'Gather project info',       body: 'Name, tech stack, primary language, description. Run /new-project to be guided through this interactively.' },
  { n: 2, icon: '📁', title: 'Create .claude/ structure', body: 'mkdir -p .claude/commands .claude/hooks .claude/skills — three directories for project-specific automation.' },
  { n: 3, icon: '📘', title: 'Create CLAUDE.md',          body: 'Project source of truth from the standard template: overview, working rules, architecture, env vars, next steps, last session summary.' },
  { n: 4, icon: '🔍', title: 'Create REVIEW.md',          body: 'Audit log from the standard template: initial entry with "no code yet" baseline and overall assessment.' },
  { n: 5, icon: '🪝', title: 'Populate hooks',            body: 'Copy or reference ~/.claude/hooks/ — pre-task, post-task, pre-commit. Customise for project-specific checks.' },
  { n: 6, icon: '🔧', title: 'Populate skills',           body: 'Copy relevant skills from ~/.claude/skills/ — always: code-review, doc-sync, session-handoff. Add image-fix for content projects.' },
  { n: 7, icon: '⚡', title: 'Create commands',           body: 'Add project-specific slash commands to .claude/commands/ for common operations (scrape, review, stats, deploy, etc.).' },
  { n: 8, icon: '📝', title: 'Initial git commit',        body: 'git add CLAUDE.md REVIEW.md .claude/ && git commit -m "chore: project scaffold with Claude Code standards"' },
  { n: 9, icon: '🔔', title: 'Health indicator setup',   body: 'Add Alert model + Alembic migration, log_analyzer.py (DB-based ALERT_RULES), alert_worker.py (5m loop + InMemoryLogHandler), GET/PATCH/DELETE /admin/alerts routes, AlertBell + HealthThermometer + AlertControls components, integrate AlertControls into all layout headers.' },
]

/**
 * DocViewModal — reusable modal for displaying fetched markdown/text documents.
 * Used by both GuidelinesTab and StandardsTab to avoid duplication.
 */
function DocViewModal({ viewingDoc, onClose, isDark }) {
  const { data: docData, isLoading, isError } = useQuery({
    queryKey: ['standards-doc', viewingDoc?.scope, viewingDoc?.path],
    queryFn: () => {
      const url = viewingDoc.scope === 'global'
        ? `/admin/docs/global/${viewingDoc.path}`
        : `/admin/docs/project/${viewingDoc.path}`
      return api.get(url).then(r => r.data)
    },
    enabled: !!viewingDoc,
    staleTime: 5 * 60_000,
  })

  if (!viewingDoc) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-4xl h-[80vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl
          ${isDark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0
          ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{viewingDoc.icon}</span>
            <span className={`text-sm font-semibold font-mono ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              {viewingDoc.scope === 'global' ? '~/.claude/' : '.claude/'}{viewingDoc.path}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium
              ${viewingDoc.scope === 'global'
                ? isDark ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : isDark ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {viewingDoc.scope === 'global' ? 'global' : 'this project'}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`text-xs font-medium px-2 py-1 rounded transition-colors
              ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
          >
            ✕ Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</p>}
          {isError && <p className="text-sm text-red-500">Failed to load. Is the backend running?</p>}
          {docData && (
            <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-mono
              ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
            >
              {docData.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

function StandardsTab() {
  const { isDark } = useTheme()
  const [viewingDoc, setViewingDoc] = useState(null)

  const card = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-2xl p-4 shadow-sm'
    : 'bg-white border border-gray-200 rounded-2xl p-4 shadow-sm'

  const sectionTitle = isDark
    ? 'text-sm font-semibold text-gray-100 mb-1'
    : 'text-sm font-semibold text-gray-900 mb-1'

  const sectionDesc = isDark
    ? 'text-xs text-gray-400 mb-4 leading-snug'
    : 'text-xs text-gray-500 mb-4 leading-snug'

  const scopeBadge = (scope) => isDark
    ? scope === 'global'
      ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300'
      : 'bg-emerald-900/40 border-emerald-700 text-emerald-300'
    : scope === 'global'
      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
      : 'bg-emerald-50 border-emerald-200 text-emerald-700'

  function FileCard({ file, scope }) {
    return (
      <div className={`rounded-xl p-3 border flex flex-col gap-1.5
        ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-100'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm shrink-0">{file.icon}</span>
            <span className={`text-[10px] font-mono font-semibold truncate
              ${isDark ? 'text-gray-200' : 'text-gray-800'}`}
            >
              {file.title}
            </span>
          </div>
          <button
            onClick={() => setViewingDoc({ ...file, scope })}
            className={`text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded transition-colors
              ${isDark ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40' : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'}`}
          >
            View →
          </button>
        </div>
        <p className={`text-[10px] leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {file.desc}
        </p>
        <span className={`self-start text-[9px] px-1.5 py-0.5 rounded border font-medium
          ${scopeBadge(scope)}`}
        >
          {scope === 'global' ? '🌍 all projects' : '📁 this project'}
        </span>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-8">

      {/* ── Section 1: Global configuration ── */}
      <div>
        <p className={sectionTitle}>🌍 Global Configuration — <code className="font-mono text-[11px]">~/.claude/</code></p>
        <p className={sectionDesc}>
          These files are loaded automatically by Claude Code in <strong>every project</strong>.
          They define universal Working Rules, security invariants, and reusable skills that apply
          regardless of what project you are working in.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {GLOBAL_CONFIG_FILES.map(f => (
            <FileCard key={f.path} file={f} scope="global" />
          ))}
        </div>
      </div>

      {/* ── Section 2: Project configuration ── */}
      <div>
        <p className={sectionTitle}>📁 Project Configuration — <code className="font-mono text-[11px]">.claude/</code></p>
        <p className={sectionDesc}>
          These files are specific to <strong>this project</strong>. They extend the global rules
          with project-specific logic: platform-specific SQL queries, FastAPI + React conventions,
          and commands for this platform's scraper, review queue, and trends pipeline.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {PROJECT_CONFIG_FILES.map(f => (
            <FileCard key={f.path} file={f} scope="project" />
          ))}
        </div>
      </div>

      {/* ── Section 3: Working Rules ── */}
      <div>
        <p className={sectionTitle}>📐 Working Rules</p>
        <p className={sectionDesc}>
          13 rules that govern every Claude Code session on this project. Color-coded by category:
          {' '}
          <span className="inline-flex items-center gap-1 text-[10px]">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> before-task
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block ml-2" /> after-task
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block ml-2" /> code-quality
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-2" /> data-safety
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block ml-2" /> git
          </span>
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {WORKING_RULES.map(({ n, cat, title, body }) => {
            const c = RULE_COLORS[cat]
            return (
              <div
                key={n}
                className={`rounded-xl px-3 py-2.5 border flex gap-3 items-start
                  ${isDark ? c.dark : c.light}`}
              >
                <div className={`text-lg font-bold tabular-nums shrink-0 leading-tight
                  ${isDark ? c.ndark : c.num}`}
                >
                  {n}
                </div>
                <div>
                  <div className={`text-xs font-semibold leading-tight
                    ${isDark ? c.ndark : c.num}`}
                  >
                    {title}
                  </div>
                  <div className={`text-[10px] mt-0.5 leading-snug
                    ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
                  >
                    {body}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Section 4: New Project Checklist ── */}
      <div>
        <p className={sectionTitle}>🚀 New Project Checklist</p>
        <p className={sectionDesc}>
          Step-by-step guide for setting up any new project with Claude Code standards.
          Run <code className="font-mono text-[11px]">/new-project</code> to execute this automatically.
        </p>
        <div className="flex flex-col gap-2">
          {NEW_PROJECT_STEPS.map(({ n, icon, title, body }) => (
            <div
              key={n}
              className={`flex gap-3 items-start rounded-xl px-3 py-2.5 border
                ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
            >
              <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-xs font-bold
                ${isDark ? 'bg-indigo-800 text-indigo-200' : 'bg-indigo-100 text-indigo-700'}`}
              >
                {n}
              </div>
              <div>
                <div className={`text-xs font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  {icon} {title}
                </div>
                <div className={`text-[10px] mt-0.5 leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {body}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-xl px-4 py-3 border text-xs leading-relaxed
          ${isDark ? 'bg-indigo-950/40 border-indigo-800 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-800'}`}
        >
          <strong>/new-project</strong> automates all 9 steps. Invoke it at the start of any new project to get CLAUDE.md, REVIEW.md, hooks, skills, and the initial commit set up in one pass.
        </div>
      </div>

      {/* ── Section 5: Health & Alerting Standard ── */}
      <div>
        <p className={sectionTitle}>🔔 Health & Alerting Standard</p>
        <p className={sectionDesc}>
          Every admin interface must include a live health indicator. These three components are
          required on all new projects. Use <code className="font-mono text-[11px]">/check-alerts</code>,{' '}
          <code className="font-mono text-[11px]">/run-log-analysis</code>, and{' '}
          <code className="font-mono text-[11px]">/clear-alerts</code> to operate the system.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            {
              icon: '🌡️', title: 'Backend',
              items: [
                'Alert model — id, level (critical/warning/info), title, message, source, is_read, created_at',
                'log_analyzer.py — ALERT_RULES list; DB-based checks; analyze_logs(db) returns triggered list',
                'alert_worker.py — 5-min loop; InMemoryLogHandler (WARNING/ERROR, app.* loggers, deque 500)',
                'GET/PATCH/DELETE /admin/alerts routes — CRUD, bulk delete, mark-read, test endpoint',
              ],
            },
            {
              icon: '🖥️', title: 'Frontend',
              items: [
                'HealthThermometer — 14×40 SVG, 4 severity levels, gradient fill, pulse when non-green',
                'AlertBell — dropdown with unread count badge, mark-read, delete; controlled + uncontrolled modes',
                'AlertControls — shared wrapper: thermometer click opens bell dropdown with shared state',
                'Integrate <AlertControls /> in every layout header (Admin, CMS, Review)',
              ],
            },
            {
              icon: '⚡', title: 'Alert Commands',
              items: [
                '/check-alerts — thermometer status, grouped table (critical→warning→info), fix suggestions, action menu',
                '/run-log-analysis — run analyze_logs() immediately; rule-by-rule output; insert triggered alerts',
                '/clear-alerts [level] — show pre-delete count; confirm for criticals; delete; suggest next step',
                'POST /admin/alerts/test — creates a test critical alert to verify the full UI flow',
              ],
            },
          ].map(({ icon, title, items }) => (
            <div
              key={title}
              className={`rounded-xl p-3 border
                ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-amber-50/40 border-amber-100'}`}
            >
              <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold
                ${isDark ? 'text-amber-300' : 'text-amber-800'}`}
              >
                <span>{icon}</span><span>{title}</span>
              </div>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className={`text-[10px] leading-snug flex gap-1.5
                    ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                  >
                    <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-xl px-4 py-3 border text-xs leading-relaxed
          ${isDark ? 'bg-amber-950/30 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
        >
          Alert rules should use <strong>DB queries</strong> (not log-file patterns) wherever possible.
          The only log-pattern rule is <code className="font-mono text-[10px]">db_connection_error</code> — kept
          because it cannot query the DB when the DB is down. See <code className="font-mono text-[10px]">services/log_analyzer.py</code>.
        </div>
      </div>

      {/* Doc viewer modal */}
      <DocViewModal
        viewingDoc={viewingDoc}
        onClose={() => setViewingDoc(null)}
        isDark={isDark}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AdminArchitecture — platform architecture reference page.
 *
 * Mounted at /admin/architecture (admin role required).
 * Fetches live stats from the API; Flow + Architecture tabs are otherwise static.
 */
export default function AdminArchitecture() {
  const [activeTab, setActiveTab] = useState('flow')
  const { isDark } = useTheme()

  const TABS = [
    { key: 'flow',         label: '⬇ Flow' },
    { key: 'architecture', label: '⬛ Architecture' },
    { key: 'guidelines',   label: '📋 Guidelines' },
    { key: 'standards',    label: '📐 Standards' },
  ]

  return (
    <div>
      {/* Page header */}
      <div className="mb-4">
        <h1 className={`text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Platform Architecture
        </h1>
        <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Data flow and system layers — click any step in the Flow tab for details.
        </p>
      </div>

      {/* Stats bar */}
      <StatsBar />

      {/* Tab bar */}
      <div className={`flex gap-1 mb-6 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-500'
                : isDark
                  ? 'border-transparent text-gray-500 hover:text-gray-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'flow'         && <FlowTab />}
      {activeTab === 'architecture' && <ArchTab />}
      {activeTab === 'guidelines'   && <GuidelinesTab />}
      {activeTab === 'standards'    && <StandardsTab />}
    </div>
  )
}
