/**
 * Architecture — embedded platform architecture and data-flow reference.
 *
 * Tabs
 * ----
 *  Flow         End-to-end data flow with clickable steps for detail panels.
 *               Trends pipeline (left) + Content pipeline (right).
 *
 *  Architecture 6-layer system diagram: External Services → Backend →
 *               Platform Settings → Frontend Apps → Site Renderer → Database.
 *
 * Features
 * --------
 *  - Dark / light mode via ThemeContext (toggle in AdminLayout nav bar).
 *  - Stats bar: live platform metrics from the API.
 *  - Clickable Flow nodes: click any step to see a detail card below the diagram.
 *  - Security badges in the Backend layer.
 *  - No external diagram libraries — pure React + Tailwind CSS.
 *
 * Mounted at /admin/architecture (admin role).
 */

import { useState } from 'react'
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

function LayerBox({ label, color = 'gray', children }) {
  const { isDark } = useTheme()

  const border = isDark ? {
    indigo: 'border-indigo-700 bg-indigo-950/40',
    sky:    'border-sky-700    bg-sky-950/40',
    green:  'border-emerald-700 bg-emerald-950/40',
    amber:  'border-amber-700  bg-amber-950/40',
    purple: 'border-purple-700 bg-purple-950/40',
    gray:   'border-gray-700   bg-gray-800/40',
  } : {
    indigo: 'border-indigo-200 bg-indigo-50/60',
    sky:    'border-sky-200    bg-sky-50/60',
    green:  'border-emerald-200 bg-emerald-50/60',
    amber:  'border-amber-200  bg-amber-50/60',
    purple: 'border-purple-200 bg-purple-50/60',
    gray:   'border-gray-200   bg-gray-50/60',
  }
  const header = isDark ? {
    indigo: 'text-indigo-400',
    sky:    'text-sky-400',
    green:  'text-emerald-400',
    amber:  'text-amber-400',
    purple: 'text-purple-400',
    gray:   'text-gray-400',
  } : {
    indigo: 'text-indigo-600',
    sky:    'text-sky-600',
    green:  'text-emerald-600',
    amber:  'text-amber-600',
    purple: 'text-purple-600',
    gray:   'text-gray-500',
  }
  return (
    <div className={`border-2 rounded-2xl p-4 ${border[color]}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${header[color]}`}>
        {label}
      </div>
      {children}
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
      <p className={`text-xs mt-1.5 leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        {detail.body}
      </p>
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
    { label: 'Workers',    value: 3,                                                color: isDark ? 'text-purple-400' : 'text-purple-600' },
    { label: 'Settings',   value: 9,                                                color: isDark ? 'text-gray-400' : 'text-gray-500' },
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
// Flow tab
// ---------------------------------------------------------------------------

function FlowTab() {
  const [selected, setSelected] = useState(null)

  const sel = (id) => setSelected(id)
  const nodeProps = { onSelect: sel, selected }

  return (
    <div>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-12 justify-center min-w-max pt-2 px-4">

          {/* ── LEFT: Trends Pipeline ─────────────────────────────────────── */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-3">
              Trends Pipeline
            </div>

            <Node
              id="google-trends-rss" color="sky" icon="📡"
              title="Google Trends RSS"
              sub="trends.google.com/trending/rss"
              wide {...nodeProps}
            />
            <Down />
            <Node
              id="trends-worker" color="sky" icon="⏰"
              title="trends_worker"
              sub="interval from PlatformSettings"
              wide {...nodeProps}
            />
            <Down label="reads trends_fetch_interval_hours" />
            <Node
              id="trend-rows-db" color="blue" icon="📊"
              title="Trend rows (DB)"
              sub="keyword · region · score · status: new"
              wide {...nodeProps}
            />
            <Down />
            <Node
              id="admin-trends" color="indigo" icon="🖥️"
              title="Admin → Trends dashboard"
              sub="Trending tab + Explore tab"
              wide {...nodeProps}
            />
            <Down />

            {/* Two outcomes side by side */}
            <div className="flex items-start gap-4 mt-1">
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-gray-400 mb-1">Dismiss</div>
                <Node color="gray" icon="🚫" title="status: dismissed" sub="soft-delete" />
              </div>
              <div className="flex flex-col items-center">
                <div className="text-[9px] text-gray-400 mb-1">Create Site</div>
                <Down />
                <Node
                  id="claude-site-config" color="green" icon="🤖"
                  title="Claude Haiku"
                  sub="generates site config"
                  {...nodeProps}
                />
                <Down />
                <Node
                  id="site-created" color="green" icon="🌐"
                  title="Site + ScrapeJob"
                  sub="status: used · site_id linked"
                  {...nodeProps}
                />
              </div>
            </div>
          </div>

          {/* ── RIGHT: Content Pipeline ───────────────────────────────────── */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3">
              Content Pipeline
            </div>

            {/* Sources row */}
            <div className="flex items-end gap-3 mb-1">
              <Node id="tavily"     color="amber" icon="🔍" title="Tavily API"  sub="primary · ai_score" {...nodeProps} />
              <Node id="google-cse" color="amber" icon="🔎" title="Google CSE" sub="secondary fallback" {...nodeProps} />
            </div>
            <Down />
            <Node
              id="scrape-worker" color="amber" icon="⏰"
              title="scrape_worker"
              sub="every 60s · keyword search → HTML fetch"
              wide {...nodeProps}
            />
            <Down label="max_searches_per_job (PlatformSettings) · SSRF guard · quality gates" />
            <Node
              id="articles-pending" color="gray" icon="📝"
              title="Articles"
              sub="status: pending · content_html"
              wide {...nodeProps}
            />
            <Down />
            <Node
              id="review-worker" color="purple" icon="⏰"
              title="review_worker"
              sub="every 30s · picks pending articles"
              wide {...nodeProps}
            />
            <Down />
            <Node
              id="claude-review" color="purple" icon="🤖"
              title="Claude Haiku AI Review"
              sub="rewrite · score · SEO · translate · image"
              wide {...nodeProps}
            />

            {/* Score decision */}
            <Diamond
              id="score-gate"
              title="ai_score ≥ threshold?"
              sub="PlatformSettings: ai_review_threshold"
              onSelect={sel} selected={selected}
            />

            {/* Two branches */}
            <div className="flex items-start gap-6 mt-2">

              {/* Auto-publish branch */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] font-semibold text-emerald-600 mb-1">Yes ✓ auto-publish</div>
                <Down />
                <Node id="auto-published" color="green" icon="✅" title="published" sub="auto-published" {...nodeProps} />
                <Down />
                <Node id="site-renderer" color="sky" icon="🖥️" title="Site Renderer" sub="port 5174+ · VITE_SITE_ID" {...nodeProps} />
                <Down />
                <Node id="public-site" color="green" icon="🏠" title="Public Site" sub="template A–E · RTL-aware" {...nodeProps} />
              </div>

              {/* Human review branch */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] font-semibold text-amber-600 mb-1">No ✗ human review</div>
                <Down />
                <Node id="stays-pending" color="amber" icon="🕐" title="stays pending" sub="score &lt; threshold" {...nodeProps} />
                <Down />
                <Node id="cms-review" color="indigo" icon="📋" title="CMS · Review app" sub="port 5173 · editor/admin" {...nodeProps} />
                <Down label="approve or reject" />
                <div className="flex items-start gap-3 mt-1">
                  <Node color="green" icon="✅" title="published" sub="PATCH status=published" />
                  <Node color="red"   icon="🗑️" title="removed"   sub="PATCH status=removed" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step detail panel */}
      {selected && (
        <StepDetail stepId={selected} onClose={() => setSelected(null)} />
      )}
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
            { icon: '🔍', title: 'Tavily',            sub: 'article search + relevance score' },
            { icon: '🔎', title: 'Google CSE',        sub: 'secondary keyword search' },
            { icon: '🤖', title: 'Anthropic',         sub: 'Claude Haiku — AI review + config' },
            { icon: '📷', title: 'Unsplash',          sub: 'image enrichment (UNSPLASH_ACCESS_KEY)' },
            { icon: '📡', title: 'Google Trends RSS', sub: 'trending keywords by region' },
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
                  ['scraper.py',        'Tavily + CSE → HTML fetch → Article'],
                  ['ai_review.py',      'Claude Haiku tool_use → rewrite + score'],
                  ['image_service.py',  'Unsplash image enrichment'],
                  ['trends_service.py', 'RSS fetch · pytrends explore · AI config'],
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
                  ['scrape_worker',  'every 60s — runs due ScrapeJobs'],
                  ['review_worker',  'every 30s — AI reviews pending articles'],
                  ['trends_worker',  'interval from PlatformSettings'],
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

      {/* 3 — Platform Settings */}
      <LayerBox label="3 · Platform Settings — admin-configurable runtime parameters" color="purple">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>
              Settings (9 keys)
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[
                ['ai_review_threshold',       'float · auto-publish gate'],
                ['auto_publish_enabled',      'bool · master switch'],
                ['max_searches_per_job',      'int · scraper URL limit'],
                ['min_paragraph_blocks',      'int · quality gate'],
                ['min_word_count',            'int · quality gate'],
                ['trends_fetch_interval_hrs', 'int · worker sleep cycle'],
                ['trends_auto_site_limit',    'int · site-creation cap'],
                ['trends_auto_site_threshold','float · score gate'],
                ['admin_theme_default',       'string · light | dark'],
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
                items: ['Dashboard', 'Sites', 'Scrape Jobs', 'Trends', 'Users', 'Architecture', 'Settings ⚙️'],
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
          <div className="flex flex-wrap gap-1">
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
    </div>
  )
}
