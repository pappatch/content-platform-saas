/**
 * Architecture — embedded platform architecture and data-flow reference.
 *
 * Tabs
 * ----
 *  Flow         End-to-end data flow: sources → workers → AI review →
 *               publish/human-review → site renderer → public site.
 *               Also shows the Trends pipeline running in parallel.
 *
 *  Architecture System layers: external services → backend (routes /
 *               services / workers / security) → frontend apps →
 *               site renderer → database models.
 *
 * No external libraries required — pure React + Tailwind CSS.
 * Mounted at /admin/architecture (admin role).
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Coloured rounded box representing one system node.
 * `wide` adds a min-width so boxes in a single column stay aligned.
 */
function Node({ color = 'gray', icon, title, sub, wide = false, className = '' }) {
  const palette = {
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
  return (
    <div
      className={`border rounded-xl px-3 py-2.5 text-center shadow-sm ${wide ? 'min-w-48' : 'min-w-36'} ${palette[color]} ${className}`}
    >
      {icon && <div className="text-base leading-none mb-0.5">{icon}</div>}
      <div className="text-xs font-semibold leading-tight">{title}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5 leading-snug">{sub}</div>}
    </div>
  )
}

/** Vertical connector arrow with an optional small label below the head. */
function Down({ label } = {}) {
  return (
    <div className="flex flex-col items-center my-0.5">
      <div className="w-px h-4 bg-gray-300" />
      <div className="text-gray-400 text-[11px] leading-none">▼</div>
      {label && (
        <div className="text-[9px] text-gray-400 mt-0.5 text-center max-w-48 leading-snug px-1">
          {label}
        </div>
      )}
    </div>
  )
}

/** Horizontal connector arrow (used inside flex rows). */
function Right() {
  return (
    <div className="flex items-center self-center mx-1 text-gray-300">
      <div className="w-5 h-px bg-gray-300" />
      <div className="text-[11px] leading-none">▶</div>
    </div>
  )
}

/** Diamond-shaped decision node (score threshold). */
function Diamond({ title, sub }) {
  return (
    <div className="flex flex-col items-center my-0.5">
      <div className="w-px h-3 bg-gray-300" />
      <div className="relative w-44 h-12 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-purple-100 border-2 border-purple-300"
          style={{ transform: 'rotate(10deg) skewX(-10deg)', borderRadius: '6px' }}
        />
        <div className="relative z-10 text-center">
          <div className="text-xs font-bold text-purple-900">{title}</div>
          {sub && <div className="text-[9px] text-purple-500">{sub}</div>}
        </div>
      </div>
    </div>
  )
}

/**
 * Labelled layer box used in the Architecture tab.
 * Children are rendered inside a padded, colour-tinted container.
 */
function LayerBox({ label, color = 'gray', children }) {
  const border = {
    indigo: 'border-indigo-200 bg-indigo-50/60',
    sky:    'border-sky-200    bg-sky-50/60',
    green:  'border-emerald-200 bg-emerald-50/60',
    amber:  'border-amber-200  bg-amber-50/60',
    purple: 'border-purple-200 bg-purple-50/60',
    gray:   'border-gray-200   bg-gray-50/60',
  }
  const header = {
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

/** Small centred arrow between two LayerBox rows. */
function LayerArrow() {
  return (
    <div className="flex justify-center my-1">
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-gray-300" />
        <div className="text-gray-400 text-sm leading-none">▼</div>
      </div>
    </div>
  )
}

/** Pill badge used for tech-stack footnotes inside LayerBox. */
function TechPill({ label }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-gray-200 text-[10px] text-gray-500 font-mono">
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Flow tab
// ---------------------------------------------------------------------------

function FlowTab() {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-12 justify-center min-w-max pt-2 px-4">

        {/* ── LEFT: Trends Pipeline ─────────────────────────────────────── */}
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-3">
            Trends Pipeline
          </div>

          <Node
            color="sky" icon="📡"
            title="Google Trends RSS"
            sub="trends.google.com/trending/rss"
            wide
          />
          <Down />
          <Node
            color="sky" icon="⏰"
            title="trends_worker"
            sub="every 5 hours"
            wide
          />
          <Down label="reads fetch_region from AppSetting" />
          <Node
            color="blue" icon="📊"
            title="Trend rows (DB)"
            sub="keyword · region · score · status: new"
            wide
          />
          <Down />
          <Node
            color="indigo" icon="🖥️"
            title="Admin → Trends dashboard"
            sub="Trending tab + Explore tab"
            wide
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
                color="green" icon="🤖"
                title="Claude Haiku"
                sub="generates site config"
              />
              <Down />
              <Node
                color="green" icon="🌐"
                title="Site + ScrapeJob"
                sub="status: used · site_id linked"
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
            <Node color="amber" icon="🔍" title="Tavily API"    sub="primary · ai_score" />
            <Node color="amber" icon="🔎" title="Google CSE"   sub="secondary fallback" />
          </div>
          <Down />
          <Node
            color="amber" icon="⏰"
            title="scrape_worker"
            sub="every 60s · keyword search → HTML fetch"
            wide
          />
          <Down label="max 10 URLs · SSRF guard · quality gates (≥3 para, ≥100 words)" />
          <Node
            color="gray" icon="📝"
            title="Articles"
            sub="status: pending · content_html"
            wide
          />
          <Down />
          <Node
            color="purple" icon="⏰"
            title="review_worker"
            sub="every 30s · picks pending articles"
            wide
          />
          <Down />
          <Node
            color="purple" icon="🤖"
            title="Claude Haiku AI Review"
            sub="rewrite · score · SEO · translate · image"
            wide
          />

          {/* Score decision */}
          <Diamond title="ai_score ≥ 0.5?" sub="AI_REVIEW_THRESHOLD" />

          {/* Two branches */}
          <div className="flex items-start gap-6 mt-2">

            {/* Auto-publish branch */}
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-semibold text-emerald-600 mb-1">Yes ✓ auto-publish</div>
              <Down />
              <Node color="green" icon="✅" title="published" sub="auto-published" />
              <Down />
              <Node
                color="sky" icon="🖥️"
                title="Site Renderer"
                sub="port 5174+ · VITE_SITE_ID"
              />
              <Down />
              <Node
                color="green" icon="🏠"
                title="Public Site"
                sub="template A–E · RTL-aware"
              />
            </div>

            {/* Human review branch */}
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-semibold text-amber-600 mb-1">No ✗ human review</div>
              <Down />
              <Node color="amber" icon="🕐" title="stays pending" sub="score &lt; 0.5" />
              <Down />
              <Node
                color="indigo" icon="📋"
                title="CMS · Review app"
                sub="port 5173 · editor/admin"
              />
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
  )
}

// ---------------------------------------------------------------------------
// Architecture tab
// ---------------------------------------------------------------------------

function ArchTab() {
  return (
    <div className="space-y-3 max-w-4xl mx-auto py-2">

      {/* External services */}
      <LayerBox label="External Services" color="amber">
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            { icon: '🔍', title: 'Tavily',             sub: 'article search + relevance score' },
            { icon: '🔎', title: 'Google CSE',         sub: 'secondary keyword search' },
            { icon: '🤖', title: 'Anthropic',          sub: 'Claude Haiku — AI review + config' },
            { icon: '📷', title: 'Unsplash',           sub: 'image enrichment (UNSPLASH_ACCESS_KEY)' },
            { icon: '📡', title: 'Google Trends RSS',  sub: 'trending keywords by region' },
          ].map(n => <Node key={n.title} color="amber" {...n} />)}
        </div>
      </LayerBox>

      <LayerArrow />

      {/* Backend */}
      <LayerBox label="Backend · FastAPI · port 8000" color="indigo">
        <div className="grid grid-cols-3 gap-4">

          {/* Routes */}
          <div>
            <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">
              Routes
            </div>
            <div className="space-y-1">
              {[
                '/auth (register · login · me)',
                '/sites (CRUD)',
                '/cms/articles (CRUD · stats)',
                '/cms/categories (CRUD)',
                '/scraper/jobs (CRUD · run)',
                '/trends (list · fetch)',
                '/trends/settings (region)',
                '/trends/explore (pytrends)',
                '/trends/{id}/create-site',
                '/public/* (unauthenticated)',
                '/admin/users',
                '/analytics (track · read)',
              ].map(r => (
                <div
                  key={r}
                  className="text-[10px] bg-white border border-indigo-100 rounded px-2 py-0.5 text-indigo-700 font-mono leading-relaxed"
                >
                  {r}
                </div>
              ))}
            </div>
          </div>

          {/* Services + Workers */}
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                Services
              </div>
              <div className="space-y-1">
                {[
                  ['scraper.py',         'Tavily + CSE → HTML fetch → Article'],
                  ['ai_review.py',       'Claude Haiku tool_use → rewrite + score'],
                  ['image_service.py',   'Unsplash image enrichment'],
                  ['trends_service.py',  'RSS fetch · pytrends explore · AI config'],
                ].map(([name, desc]) => (
                  <div key={name} className="bg-white border border-indigo-100 rounded px-2 py-1">
                    <div className="text-[10px] font-mono font-semibold text-indigo-700">{name}</div>
                    <div className="text-[9px] text-indigo-400 leading-tight">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                Background Workers
              </div>
              <div className="space-y-1">
                {[
                  ['scrape_worker',  'every 60s — runs due ScrapeJobs'],
                  ['review_worker',  'every 30s — AI reviews pending articles'],
                  ['trends_worker',  'every 5h — fetches Google Trends'],
                ].map(([name, desc]) => (
                  <div key={name} className="bg-white border border-indigo-100 rounded px-2 py-1">
                    <div className="text-[10px] font-mono font-semibold text-indigo-700">{name}</div>
                    <div className="text-[9px] text-indigo-400 leading-tight">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Security + Stack */}
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                Security
              </div>
              <div className="space-y-1">
                {[
                  'JWT (PyJWT) + bcrypt',
                  'Roles: admin · editor · viewer',
                  'SSRF protection (RFC-1918 block)',
                  'HTML sanitizer (XSS denylist)',
                  'Alembic (never drop/recreate)',
                ].map(s => (
                  <div
                    key={s}
                    className="text-[10px] bg-white border border-indigo-100 rounded px-2 py-1 text-indigo-700"
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                Stack
              </div>
              <div className="flex flex-wrap gap-1">
                {['FastAPI', 'SQLAlchemy', 'Alembic', 'Pydantic v2', 'httpx', 'BeautifulSoup', 'pytrends', 'anthropic'].map(t => (
                  <TechPill key={t} label={t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </LayerBox>

      <LayerArrow />

      {/* Frontend */}
      <div className="grid grid-cols-2 gap-3">

        {/* Admin / CMS / Review */}
        <LayerBox label="Admin · CMS · Review — port 5173" color="sky">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              {
                group: 'Admin',
                items: ['Dashboard', 'Sites', 'Scrape Jobs', 'Trends', 'Users', 'Architecture'],
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
                <div className="text-[9px] font-bold text-sky-500 uppercase tracking-wider mb-1.5">
                  {group}
                </div>
                {items.map(item => (
                  <div
                    key={item}
                    className="text-[10px] bg-white border border-sky-100 rounded px-1.5 py-0.5 text-sky-800 mb-1 leading-snug"
                  >
                    {item}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {['React', 'Vite', 'react-query', 'axios', 'recharts', 'TipTap', 'JWT → localStorage'].map(t => (
              <TechPill key={t} label={t} />
            ))}
          </div>
        </LayerBox>

        {/* Site Renderer */}
        <LayerBox label="Site Renderer — port 5174+" color="green">
          <div className="space-y-2 mb-2">
            <div>
              <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1.5">
                Templates
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  'A — Newspaper',
                  'B — Magazine',
                  'C — Blog',
                  'D — Cards',
                  'E — Sidebar',
                ].map(t => (
                  <div
                    key={t}
                    className="text-[10px] bg-white border border-emerald-100 rounded px-2 py-0.5 text-emerald-800"
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1.5">
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
                  'article.main_image_url',
                  'getDefaultImage() utility',
                ].map(f => (
                  <div
                    key={f}
                    className="text-[10px] bg-white border border-emerald-100 rounded px-1.5 py-0.5 text-emerald-800 leading-snug"
                  >
                    {f}
                  </div>
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

      {/* Database */}
      <LayerBox label="Database — SQLite (dev) · Postgres-ready (prod)" color="gray">
        <div className="flex flex-wrap gap-2 justify-center mb-2">
          {[
            { name: 'User',       desc: 'auth · bcrypt · roles' },
            { name: 'Site',       desc: 'domain · template · config JSON' },
            { name: 'Category',   desc: 'per-site · URL slug' },
            { name: 'Article',    desc: 'content_html · ai_score · SEO · pinned' },
            { name: 'ScrapeJob',  desc: 'keywords · frequency · status' },
            { name: 'Analytics',  desc: 'page-view events · site/article' },
            { name: 'Trend',      desc: 'keyword · region · score · site_id FK' },
            { name: 'AppSetting', desc: 'key-value · trends_fetch_region' },
          ].map(({ name, desc }) => (
            <div key={name} className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-center shadow-sm">
              <div className="text-xs font-semibold text-gray-800">{name}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">{desc}</div>
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
 * No API calls — purely static documentation rendered as interactive diagrams.
 */
export default function AdminArchitecture() {
  const [activeTab, setActiveTab] = useState('flow')

  const TABS = [
    { key: 'flow',         label: '⬇ Flow' },
    { key: 'architecture', label: '⬛ Architecture' },
  ]

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Platform Architecture</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Data flow and system layers — updated to reflect the current codebase.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-600'
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
