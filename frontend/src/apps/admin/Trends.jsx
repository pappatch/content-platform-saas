/**
 * Trends dashboard — Google Trends monitoring and one-click site creation.
 *
 * Layout
 * ------
 *  Header row: title + top-level tabs (Trending | Explore)
 *  Trending tab:
 *    - Region selector (grouped <optgroup>) + active region badge + Run Now button
 *    - Stat cards + status/language filters
 *    - Trend cards grid with ScoreBar, Dismiss, Create Site
 *    - Create Site modal: AI config preview with editable fields → Confirm
 *  Explore tab:
 *    - Keyword input + timeframe selector + geo selector + Explore button
 *    - Interest LineChart, top-countries BarChart, related queries
 *    - Create Site button → reuses CreateSiteModal with explore-specific configFn
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../../api/client'
import Spinner from '../../components/Spinner'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const getTrends        = (params) => api.get('/trends', { params }).then(r => r.data)
const getTrendsStats   = ()       => api.get('/trends/stats').then(r => r.data)
const getRegions       = ()       => api.get('/trends/regions').then(r => r.data)
const getTrendSettings = ()       => api.get('/trends/settings').then(r => r.data)
const postTrendSettings = (body)  => api.post('/trends/settings', body).then(r => r.data)
const postFetch        = ()       => api.post('/trends/fetch').then(r => r.data)
const getSiteConfig    = (id)     => api.get(`/trends/${id}/site-config`).then(r => r.data)
const getExploreSiteConfig = ({ keyword, language }) =>
  api.get('/trends/explore/site-config', { params: { keyword, language } }).then(r => r.data)
const postDismiss      = (id)     => api.post(`/trends/${id}/dismiss`).then(r => r.data)
const postCreateSite   = ({ trendId, overrides }) =>
  api.post(`/trends/${trendId}/create-site`, overrides).then(r => r.data)
const postExploreSiteCreate = ({ keyword, language, overrides }) =>
  api.post('/trends/explore/create-site', overrides, { params: { keyword, language } }).then(r => r.data)
const getExplore = (params) =>
  api.get('/trends/explore', { params }).then(r => r.data)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_TABS = [
  { value: '',          label: 'All' },
  { value: 'new',       label: 'New' },
  { value: 'used',      label: 'Used' },
  { value: 'dismissed', label: 'Dismissed' },
]

const LANG_OPTIONS = [
  { value: '',   label: 'All languages' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'Hebrew' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
]

const TIMEFRAME_OPTIONS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y',  label: 'Last 12 months' },
]

// Simple geo → site language heuristic for the Explore create-site flow.
const GEO_LANG = { IL: 'he', SA: 'ar', AE: 'ar', EG: 'ar', FR: 'fr', BE: 'fr', MA: 'fr' }

const STATUS_STYLES = {
  new:       'bg-blue-100 text-blue-700',
  used:      'bg-green-100 text-green-700',
  dismissed: 'bg-gray-100 text-gray-500',
}

const TEMPLATE_LABELS = {
  'template-a': 'Newspaper',
  'template-b': 'Magazine',
  'template-c': 'Blog',
  'template-d': 'Cards',
  'template-e': 'Sidebar',
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

/** Score bar — converts 0-1 score to a coloured horizontal bar. */
function ScoreBar({ score }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-gray-500 w-6 text-right">{pct}</span>
    </div>
  )
}

/** Colour swatch used in the site config preview. */
function Swatch({ hex, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded border border-gray-200 shrink-0" style={{ background: hex }} />
      <span className="text-xs text-gray-600 font-mono">{hex}</span>
      <span className="text-xs text-gray-400">({label})</span>
    </div>
  )
}

/** Manual-mode quota badge shown in the header. */
function QuotaBadge({ used, limit }) {
  const full = used >= limit
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
      full ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
    }`}>
      <span>{used}/{limit} sites created</span>
      {full && <span title="Limit reached">⚠</span>}
    </span>
  )
}

/** Active fetch-region badge shown next to Run Now. */
function RegionBadge({ geo, regions }) {
  let name = 'Worldwide'
  if (geo) {
    for (const group of (regions || [])) {
      const entry = group.regions.find(r => r.geo === geo)
      if (entry) { name = entry.name; break }
    }
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
      🌍 {name}
    </span>
  )
}

// ---------------------------------------------------------------------------
// CreateSiteModal — accepts configQueryKey/configQueryFn props so it can be
// reused for both the trend-based and explore-based create flows.
// ---------------------------------------------------------------------------

function CreateSiteModal({ keyword, configQueryKey, configQueryFn, onClose, onConfirm, isCreating }) {
  const [overrides, setOverrides] = useState({})

  const { data: config, isLoading, isError } = useQuery({
    queryKey: configQueryKey,
    queryFn: configQueryFn,
    staleTime: 5 * 60 * 1000,
  })

  const set = (key, val) => setOverrides(prev => ({ ...prev, [key]: val }))
  const eff = { ...config, ...overrides }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create Site</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Keyword: <span className="font-medium text-gray-600">"{keyword}"</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner />
              <p className="text-sm text-gray-500">Asking Claude Haiku to design your site…</p>
            </div>
          )}
          {isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              AI config generation failed. You can still create the site with default settings.
            </div>
          )}
          {eff.site_name != null && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Site name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={eff.site_name || ''}
                  onChange={(e) => set('site_name', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Domain slug <span className="text-gray-400 font-normal">(becomes slug.auto)</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={eff.domain_slug || ''}
                  onChange={(e) => set('domain_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Template</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={eff.template_id || 'template-a'}
                    onChange={(e) => set('template_id', e.target.value)}
                  >
                    {Object.entries(TEMPLATE_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label} ({id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={eff.language || 'en'}
                    onChange={(e) => set('language', e.target.value)}
                  >
                    {LANG_OPTIONS.filter(o => o.value).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {eff.config && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Brand colours</label>
                  <div className="space-y-1.5">
                    <Swatch hex={eff.config.primary_color || '#6366f1'} label="Primary" />
                    <Swatch hex={eff.config.secondary_color || '#10b981'} label="Secondary" />
                  </div>
                </div>
              )}
              {eff.keywords?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Scrape keywords</label>
                  <div className="flex flex-wrap gap-1.5">
                    {eff.keywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {eff.description && (
                <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">
                  {eff.description}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(overrides)}
            disabled={isLoading || isCreating}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? 'Creating…' : 'Create Site'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TrendCard
// ---------------------------------------------------------------------------

function TrendCard({ trend, onDismiss, onCreateSite, isDismissing, isAtLimit }) {
  const statusStyle = STATUS_STYLES[trend.status] || 'bg-gray-100 text-gray-500'
  const isNew = trend.status === 'new'

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-3 ${
      !isNew ? 'opacity-60' : ''
    }`}>
      {/* Top row: keyword + status badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900 text-sm leading-snug break-words flex-1">
          {trend.keyword}
        </p>
        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
          {trend.status}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
        <span className="uppercase font-mono">{trend.region || '🌐'}</span>
        <span className="text-gray-300">·</span>
        <span className="uppercase font-mono">{trend.language}</span>
        <span className="text-gray-300">·</span>
        <span>{trend.trend_date}</span>
        {trend.is_duplicate && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-amber-600 font-medium">Seen before</span>
          </>
        )}
      </div>

      {/* Score bar */}
      <ScoreBar score={trend.score} />

      {/* Actions — only shown for new trends */}
      {isNew && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onCreateSite(trend)}
            disabled={isAtLimit}
            title={isAtLimit ? 'Auto-site limit reached' : 'Create a site from this trend'}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create Site
          </button>
          <button
            onClick={() => onDismiss(trend.id)}
            disabled={isDismissing}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {trend.status === 'used' && trend.site_id && (
        <p className="text-xs text-green-600">Site #{trend.site_id} created</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TrendingPanel — the main trends list view
// ---------------------------------------------------------------------------

function TrendingPanel({ stats, regions, activeRegion, onRegionChange, isChangingRegion }) {
  const qc = useQueryClient()

  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedLang,   setSelectedLang]   = useState('')
  const [modal, setModal] = useState({ open: false, trendId: null, keyword: '' })

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: trends = [], isLoading, isError } = useQuery({
    queryKey: ['trends', selectedStatus, selectedLang],
    queryFn: () => getTrends({
      ...(selectedStatus ? { status: selectedStatus } : {}),
      ...(selectedLang   ? { language: selectedLang }  : {}),
      limit: 100,
    }),
    refetchInterval: 120_000,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const fetchMut = useMutation({
    mutationFn: postFetch,
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['trends'] })
        qc.invalidateQueries({ queryKey: ['trends-stats'] })
      }, 3000)
    },
  })

  const dismissMut = useMutation({
    mutationFn: postDismiss,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trends'] })
      qc.invalidateQueries({ queryKey: ['trends-stats'] })
    },
  })

  const createSiteMut = useMutation({
    mutationFn: postCreateSite,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['trends'] })
      qc.invalidateQueries({ queryKey: ['trends-stats'] })
      qc.invalidateQueries({ queryKey: ['sites'] })
      setModal({ open: false, trendId: null, keyword: '' })
      alert(`Site "${result.site.name}" created! ScrapeJob #${result.scrape_job.id} is ready.`)
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || 'Site creation failed'
      alert(`Error: ${detail}`)
    },
  })

  // ── Derived ───────────────────────────────────────────────────────────────

  const autoUsed  = stats?.auto_sites_created ?? 0
  const autoLimit = stats?.auto_site_limit    ?? 3
  const isAtLimit = autoUsed >= autoLimit

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Region + Run Now row */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Grouped region selector */}
        <select
          value={activeRegion}
          onChange={(e) => onRegionChange(e.target.value)}
          disabled={isChangingRegion}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        >
          <option value="">🌐 Worldwide</option>
          {(regions || []).map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.regions.map(r => (
                <option key={r.geo} value={r.geo}>{r.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="flex-1" />

        {stats && <QuotaBadge used={autoUsed} limit={autoLimit} />}
        <RegionBadge geo={activeRegion} regions={regions} />
        <button
          onClick={() => fetchMut.mutate()}
          disabled={fetchMut.isPending}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {fetchMut.isPending ? 'Fetching…' : 'Run Now'}
        </button>
      </div>

      {/* Stat row */}
      {stats && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {['new', 'used', 'dismissed'].map((s) => (
            <div key={s} className="card px-4 py-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                s === 'new' ? 'bg-blue-400' : s === 'used' ? 'bg-green-400' : 'bg-gray-300'
              }`} />
              <span className="text-sm font-medium text-gray-700 capitalize">{s}</span>
              <span className="text-sm text-gray-500">{stats[s] ?? 0}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSelectedStatus(value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedStatus === value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={selectedLang}
          onChange={(e) => setSelectedLang(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {LANG_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Fetch success banner */}
      {fetchMut.isSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          Fetch started in background. New trends will appear within a few seconds.
        </div>
      )}

      {/* Limit warning */}
      {isAtLimit && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
          Auto-site limit reached ({autoUsed}/{autoLimit}). To create more sites from trends,
          increase <code className="font-mono bg-amber-100 px-1 rounded">TRENDS_AUTO_SITE_LIMIT</code> in your environment config.
        </div>
      )}

      {/* Trend cards */}
      {isLoading && <Spinner />}
      {isError && (
        <p className="text-sm text-red-500">Failed to load trends. Is the backend running?</p>
      )}
      {!isLoading && trends.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-sm font-medium">No trends yet</p>
          <p className="text-xs mt-1">Click "Run Now" to fetch the latest Google Trends.</p>
        </div>
      )}
      {trends.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {trends.map((trend) => (
            <TrendCard
              key={trend.id}
              trend={trend}
              onDismiss={(id) => dismissMut.mutate(id)}
              onCreateSite={(t) => setModal({ open: true, trendId: t.id, keyword: t.keyword })}
              isDismissing={dismissMut.isPending}
              isAtLimit={isAtLimit}
            />
          ))}
        </div>
      )}

      {/* Create Site Modal (trend flow) */}
      {modal.open && (
        <CreateSiteModal
          keyword={modal.keyword}
          configQueryKey={['trend-site-config', modal.trendId]}
          configQueryFn={() => getSiteConfig(modal.trendId)}
          onClose={() => setModal({ open: false, trendId: null, keyword: '' })}
          onConfirm={(overrides) => createSiteMut.mutate({ trendId: modal.trendId, overrides })}
          isCreating={createSiteMut.isPending}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExplorePanel — keyword deep-dive with charts + create-site
// ---------------------------------------------------------------------------

function ExplorePanel({ regions, isAtLimit }) {
  const qc = useQueryClient()

  const [keyword,   setKeyword]   = useState('')
  const [timeframe, setTimeframe] = useState('30d')
  const [geo,       setGeo]       = useState('')

  // Holds the params for the last submitted query (null = never searched)
  const [exploreParams, setExploreParams] = useState(null)

  // Modal for creating a site from the explored keyword
  const [modal, setModal] = useState({ open: false, keyword: '', language: 'en' })

  // ── Explore query ─────────────────────────────────────────────────────────

  const { data: exploreData, isLoading: isExploring, isError: exploreError, isFetching } = useQuery({
    queryKey: ['trends-explore', exploreParams],
    queryFn: () => getExplore(exploreParams),
    enabled: !!exploreParams,
    staleTime: 5 * 60 * 1000,
  })

  // ── Create site mutation (explore flow) ───────────────────────────────────

  const createMut = useMutation({
    mutationFn: postExploreSiteCreate,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['trends-stats'] })
      qc.invalidateQueries({ queryKey: ['sites'] })
      setModal({ open: false, keyword: '', language: 'en' })
      alert(`Site "${result.site.name}" created! ScrapeJob #${result.scrape_job.id} is ready.`)
    },
    onError: (err) => {
      const detail = err.response?.data?.detail || 'Site creation failed'
      alert(`Error: ${detail}`)
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleExplore() {
    const kw = keyword.trim()
    if (!kw) return
    setExploreParams({ keyword: kw, timeframe, geo })
  }

  function openCreateModal() {
    const kw  = exploreParams?.keyword || ''
    const lng = GEO_LANG[geo] || 'en'
    setModal({ open: true, keyword: kw, language: lng })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasResults = !!exploreData
  const showEmpty  = !exploreParams && !isExploring

  return (
    <div className="space-y-6">
      {/* Search controls */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="flex-1 min-w-52 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Enter a keyword to explore…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleExplore()}
        />
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {TIMEFRAME_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={geo}
          onChange={(e) => setGeo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">🌐 Worldwide</option>
          {(regions || []).map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.regions.map(r => (
                <option key={r.geo} value={r.geo}>{r.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={handleExplore}
          disabled={!keyword.trim() || isExploring || isFetching}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isExploring || isFetching ? 'Exploring…' : 'Explore'}
        </button>
      </div>

      {/* States */}
      {(isExploring || isFetching) && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}
      {exploreError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Exploration failed — Google may be rate-limiting. Try again in a moment.
        </div>
      )}
      {showEmpty && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm font-medium">Enter a keyword and click Explore</p>
          <p className="text-xs mt-1">See interest over time, top countries, and related queries.</p>
        </div>
      )}

      {/* Results */}
      {hasResults && !isExploring && !isFetching && (
        <div className="space-y-5">
          {/* Interest over time */}
          {exploreData.interest_over_time?.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Interest over time —{' '}
                <span className="text-indigo-600">{exploreData.keyword}</span>
                <span className="text-gray-400 font-normal ml-1">({exploreData.timeframe})</span>
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={exploreData.interest_over_time}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => d.slice(5)}
                    interval="preserveStartEnd"
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28} />
                  <Tooltip
                    formatter={(v) => [`${v}`, 'Interest']}
                    labelFormatter={(l) => `Date: ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top countries */}
          {exploreData.top_countries?.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Top countries by interest</h3>
              <ResponsiveContainer width="100%" height={Math.min(exploreData.top_countries.length, 15) * 28 + 40}>
                <BarChart
                  data={exploreData.top_countries.slice(0, 15)}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="country" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v) => [`${v}`, 'Interest']} />
                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Related queries */}
          {exploreData.related_queries?.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Related queries</h3>
              <div className="flex flex-wrap gap-2">
                {exploreData.related_queries.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setKeyword(q.query)}
                    title="Click to explore this query"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-sm text-gray-700 border border-gray-200 transition-colors"
                  >
                    {q.query}
                    <span className="text-xs text-gray-400 font-mono">{q.value}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create Site CTA */}
          <div className="flex justify-end pt-1">
            <button
              onClick={openCreateModal}
              disabled={isAtLimit}
              title={isAtLimit ? 'Auto-site limit reached' : undefined}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Site from "{exploreParams?.keyword}"
            </button>
          </div>
        </div>
      )}

      {/* Create Site Modal (explore flow) */}
      {modal.open && (
        <CreateSiteModal
          keyword={modal.keyword}
          configQueryKey={['explore-site-config', modal.keyword, modal.language]}
          configQueryFn={() => getExploreSiteConfig({ keyword: modal.keyword, language: modal.language })}
          onClose={() => setModal({ open: false, keyword: '', language: 'en' })}
          onConfirm={(overrides) =>
            createMut.mutate({ keyword: modal.keyword, language: modal.language, overrides })
          }
          isCreating={createMut.isPending}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AdminTrends — main dashboard
// ---------------------------------------------------------------------------

/**
 * AdminTrends — Google Trends dashboard.
 *
 * Mounted at /admin/trends (admin role required — enforced by AdminLayout
 * and the ProtectedRoute wrapper in App.jsx).
 */
export default function AdminTrends() {
  const qc = useQueryClient()

  // Top-level tab state
  const [activeTab, setActiveTab] = useState('trending')

  // ── Shared queries ────────────────────────────────────────────────────────

  const { data: stats } = useQuery({
    queryKey: ['trends-stats'],
    queryFn: getTrendsStats,
    refetchInterval: 60_000,
  })

  const { data: regions = [] } = useQuery({
    queryKey: ['trends-regions'],
    queryFn: getRegions,
    staleTime: Infinity,   // region list is static; no need to refetch
  })

  const { data: settings } = useQuery({
    queryKey: ['trends-settings'],
    queryFn: getTrendSettings,
  })

  const activeRegion = settings?.fetch_region ?? ''

  // ── Region change mutation ─────────────────────────────────────────────────

  const regionMut = useMutation({
    mutationFn: (geo) => postTrendSettings({ fetch_region: geo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trends-settings'] }),
  })

  // ── Derived ───────────────────────────────────────────────────────────────

  const autoUsed  = stats?.auto_sites_created ?? 0
  const autoLimit = stats?.auto_site_limit    ?? 3
  const isAtLimit = autoUsed >= autoLimit

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Trending Topics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Google Trends · updated every 5 hours</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'trending', label: '📈 Trending' },
          { key: 'explore',  label: '🔍 Explore' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
      {activeTab === 'trending' && (
        <TrendingPanel
          stats={stats}
          regions={regions}
          activeRegion={activeRegion}
          onRegionChange={(geo) => regionMut.mutate(geo)}
          isChangingRegion={regionMut.isPending}
          isAtLimit={isAtLimit}
        />
      )}
      {activeTab === 'explore' && (
        <ExplorePanel
          regions={regions}
          isAtLimit={isAtLimit}
        />
      )}
    </div>
  )
}
