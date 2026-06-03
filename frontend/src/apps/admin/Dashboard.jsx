/**
 * Admin Dashboard — comprehensive platform overview.
 *
 * Sections
 * --------
 *  1. Platform Health Bar  — inline badges: sites, articles, pending, failed jobs, API statuses
 *  2. Content Pipeline     — 4 stat cards + stacked bar chart per site
 *  3. AI Quality Overview  — score histogram, avg score per site (H-bar), auto-publish donut
 *  4. Scrape Activity      — jobs table with inline Run Now
 *  5. Recent Activity Feed — last 10 articles added, clickable → CMS
 *  6. Trends Snapshot      — top 3 active trends with score bars
 *  7. System Alerts        — last 3 unread alerts + thermometer summary
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../context/ThemeContext'
import { getArticleStats, getArticles } from '../../services/articles'
import { getSites } from '../../services/sites'
import { getJobs, runJob } from '../../services/scrapeJobs'
import api from '../../api/client'
import Spinner from '../../components/Spinner'
import AiScoreBadge from '../../components/AiScoreBadge'
import StatusBadge from '../../components/StatusBadge'

// ---------------------------------------------------------------------------
// API helpers (not in service files)
// ---------------------------------------------------------------------------

const fetchApiUsage     = () => api.get('/admin/api-usage').then(r => r.data)
const fetchAlertsSummary = () =>
  api.get('/admin/alerts', { params: { is_read: false, limit: 3 } }).then(r => r.data)
const fetchTrendsSnapshot = () =>
  api.get('/trends', { params: { status: 'new', limit: 3 } }).then(r => r.data)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_META = [
  { key: 'published', label: 'Published',     color: '#10b981', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', darkBg: 'bg-green-900/30', darkText: 'text-green-300', darkBorder: 'border-green-800' },
  { key: 'pending',   label: 'Pending Review', color: '#f59e0b', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', darkBg: 'bg-amber-900/30', darkText: 'text-amber-300', darkBorder: 'border-amber-800', link: '/review' },
  { key: 'removed',   label: 'Removed',        color: '#ef4444', bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',   darkBg: 'bg-red-900/30',   darkText: 'text-red-300',   darkBorder: 'border-red-800' },
  { key: 'total',     label: 'Total Articles', color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', darkBg: 'bg-indigo-900/30', darkText: 'text-indigo-300', darkBorder: 'border-indigo-800' },
]

const ALERT_LEVEL_COLORS = {
  critical: { badge: 'bg-red-100 text-red-700',    dot: '#ef4444' },
  warning:  { badge: 'bg-amber-100 text-amber-700', dot: '#f59e0b' },
  info:     { badge: 'bg-blue-100 text-blue-700',   dot: '#3b82f6' },
}

const ALERT_LEVEL_COLORS_DARK = {
  critical: 'bg-red-900/40 text-red-300',
  warning:  'bg-amber-900/40 text-amber-300',
  info:     'bg-blue-900/40 text-blue-300',
}

const JOB_STATUS_BADGE = {
  pending: 'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700',
  done:    'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
}

function scoreBucketColor(idx) {
  const mid = idx * 0.1 + 0.05
  if (mid >= 0.7) return '#10b981'
  if (mid >= 0.5) return '#f59e0b'
  return '#ef4444'
}

function timeAgo(iso) {
  if (!iso) return '—'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {children}
      </h2>
      {action}
    </div>
  )
}

function EmptyChart({ message = 'No data yet' }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400 italic">
      {message}
    </div>
  )
}

function StyledTooltip({ active, payload, label, isDark }) {
  if (!active || !payload?.length) return null
  const bg = isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
  const titleCls = isDark ? 'text-gray-200' : 'text-gray-700'
  return (
    <div className={`${bg} border rounded-lg shadow-lg px-3 py-2 text-xs`}>
      {label && <p className={`font-semibold ${titleCls} mb-1`}>{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 ${className}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform Health Bar
// ---------------------------------------------------------------------------

function HealthBadge({ label, value, status = 'neutral' }) {
  const cls = {
    neutral: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    ok:      'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    warn:    'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    error:   'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  }[status] || 'bg-gray-100 text-gray-600'

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      <span className="font-semibold">{value ?? '…'}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}

function ApiStatusBadge({ id, label, services }) {
  const svc = services?.find(s => s.id === id)
  if (!svc) return <HealthBadge label={label} value="—" />
  const status = svc.status === 'ok' ? 'ok' : svc.status === 'warning' ? 'warn' : 'error'
  const icon   = status === 'ok' ? '●' : status === 'warn' ? '◐' : '●'
  return <HealthBadge label={label} value={icon} status={status} />
}

function PlatformHealthBar({ stats, sites, jobs, apiUsage, articlesLoading }) {
  const failedJobs  = jobs.filter(j => j.status === 'failed').length
  const pendingCount = stats?.pending ?? 0

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">
        System
      </span>
      <HealthBadge label="sites" value={sites.length} status={sites.length > 0 ? 'ok' : 'neutral'} />
      <HealthBadge
        label="articles"
        value={articlesLoading ? '…' : (stats?.total ?? '—')}
        status="neutral"
      />
      <HealthBadge
        label="pending review"
        value={pendingCount}
        status={pendingCount > 0 ? 'warn' : 'ok'}
      />
      <HealthBadge
        label="failed jobs"
        value={failedJobs}
        status={failedJobs > 0 ? 'error' : 'ok'}
      />
      <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">
        APIs
      </span>
      <ApiStatusBadge id="anthropic"   label="Anthropic" services={apiUsage?.services} />
      <ApiStatusBadge id="tavily"      label="Tavily"    services={apiUsage?.services} />
      <ApiStatusBadge id="unsplash"    label="Unsplash"  services={apiUsage?.services} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content Pipeline: stat cards + stacked bar
// ---------------------------------------------------------------------------

function StatCard({ label, value, bg, text, border, darkBg, darkText, darkBorder, loading, link }) {
  const { isDark } = useTheme()
  const bgCls     = isDark ? darkBg     : bg
  const textCls   = isDark ? darkText   : text
  const borderCls = isDark ? darkBorder : border
  const inner = (
    <div className={`rounded-xl border p-5 ${bgCls} ${borderCls}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${textCls}`}>
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold ${textCls}`}>
        {loading ? '…' : (value ?? '—')}
      </div>
      {link && (
        <div className={`mt-1 text-xs ${textCls} opacity-60`}>
          Click to review →
        </div>
      )}
    </div>
  )
  if (link) return <Link to={link} className="block hover:opacity-90 transition-opacity">{inner}</Link>
  return inner
}

// ---------------------------------------------------------------------------
// AI Quality: donut (auto-published vs review)
// ---------------------------------------------------------------------------

const DONUT_COLORS = ['#10b981', '#f59e0b']

// ---------------------------------------------------------------------------
// Scrape Activity table
// ---------------------------------------------------------------------------

function FreqLabel({ minutes }) {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)}d`
  if (minutes >= 60)   return `${Math.round(minutes / 60)}h`
  return `${minutes}m`
}

function nextRun(job) {
  if (!job.last_run) return 'Soon'
  const next = new Date(new Date(job.last_run).getTime() + job.frequency_minutes * 60_000)
  const diff = next - Date.now()
  if (diff <= 0) return 'Due now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `in ${m}m`
  return `in ${Math.floor(m / 60)}h ${m % 60}m`
}

// ---------------------------------------------------------------------------
// Trends Snapshot
// ---------------------------------------------------------------------------

function TrendScoreBar({ score }) {
  const pct = Math.round((score ?? 0) * 100)
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { user } = useAuth()
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const [runningJobIds, setRunningJobIds] = useState(new Set())

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['article-stats'],
    queryFn: getArticleStats,
    refetchInterval: 30_000,
  })

  const { data: allArticles = [], isLoading: articlesLoading } = useQuery({
    queryKey: ['cms-articles-dashboard'],
    queryFn: () => getArticles(),
    refetchInterval: 30_000,
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['scrape-jobs'],
    queryFn: getJobs,
    refetchInterval: 10_000,
  })

  const { data: apiUsage } = useQuery({
    queryKey: ['api-usage-dashboard'],
    queryFn: fetchApiUsage,
    refetchInterval: 60_000,
    retry: false,
  })

  const { data: alertsData } = useQuery({
    queryKey: ['alerts-dashboard'],
    queryFn: fetchAlertsSummary,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: trendsData } = useQuery({
    queryKey: ['trends-snapshot'],
    queryFn: fetchTrendsSnapshot,
    refetchInterval: 60_000,
    retry: false,
  })

  // ── Derived data ──────────────────────────────────────────────────────────

  const siteMap = useMemo(
    () => Object.fromEntries(sites.map(s => [s.id, s.name])),
    [sites],
  )

  // Stacked bar: published/pending/removed per site
  const perSiteData = useMemo(() => {
    const acc = {}
    for (const a of allArticles) {
      const name = siteMap[a.site_id] || `Site ${a.site_id}`
      if (!acc[name]) acc[name] = { site: name, published: 0, pending: 0, removed: 0 }
      acc[name][a.status] = (acc[name][a.status] || 0) + 1
    }
    return Object.values(acc).sort(
      (a, b) => (b.published + b.pending + b.removed) - (a.published + a.pending + a.removed)
    )
  }, [allArticles, siteMap])

  // Histogram: ai_score in 10 buckets
  const scoreData = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}–${i * 10 + 10}`,
      count: 0,
      color: scoreBucketColor(i),
    }))
    for (const a of allArticles) {
      if (a.ai_score != null) {
        const idx = Math.min(Math.floor(a.ai_score * 10), 9)
        buckets[idx].count++
      }
    }
    return buckets
  }, [allArticles])

  // Avg AI score per site (horizontal bar)
  const avgScorePerSite = useMemo(() => {
    const acc = {}
    for (const a of allArticles) {
      if (a.ai_score == null) continue
      const name = siteMap[a.site_id] || `Site ${a.site_id}`
      if (!acc[name]) acc[name] = { sum: 0, count: 0 }
      acc[name].sum += a.ai_score
      acc[name].count++
    }
    return Object.entries(acc)
      .map(([site, { sum, count }]) => ({ site, avg: parseFloat((sum / count).toFixed(2)) }))
      .sort((a, b) => b.avg - a.avg)
  }, [allArticles, siteMap])

  // Donut: auto-published (published) vs sent-to-review (pending)
  const donutData = useMemo(() => {
    const published = allArticles.filter(a => a.status === 'published' && a.ai_score != null).length
    const pending   = allArticles.filter(a => a.status === 'pending'   && a.ai_score != null).length
    if (published + pending === 0) return []
    return [
      { name: 'Auto-published', value: published },
      { name: 'Sent to review', value: pending },
    ]
  }, [allArticles])

  // Recent activity: last 10 articles by created_at
  const recentArticles = useMemo(
    () => [...allArticles]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10),
    [allArticles],
  )

  // Top trends (already limited to 3 by API)
  const topTrends = trendsData?.trends ?? trendsData ?? []

  // ── Run Job handler ────────────────────────────────────────────────────────

  async function handleRunJob(id) {
    setRunningJobIds(prev => new Set(prev).add(id))
    try {
      await runJob(id)
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] })
    } catch {
      // job errors surface in the jobs table status
    } finally {
      setRunningJobIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  // ── Chart colours (dark-mode aware) ───────────────────────────────────────

  const gridColor = isDark ? '#374151' : '#f3f4f6'
  const tickColor = isDark ? '#9ca3af' : '#6b7280'

  const tooltipProps = { content: <StyledTooltip isDark={isDark} /> }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Welcome back, {user?.email}
        </p>
      </div>

      {/* ── 1. Platform Health Bar ────────────────────────────────────────── */}
      <PlatformHealthBar
        stats={stats}
        sites={sites}
        jobs={jobs}
        apiUsage={apiUsage}
        articlesLoading={articlesLoading}
      />

      {/* ── 2. Content Pipeline — stat cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATUS_META.map(m => (
          <StatCard key={m.key} {...m} value={stats?.[m.key]} loading={statsLoading} />
        ))}
      </div>

      {/* ── 3. Charts row — per-site stacked bar + AI score histogram ──────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">

        {/* Articles per site */}
        <Card>
          <SectionTitle>Articles per site</SectionTitle>
          {perSiteData.length === 0 ? (
            <div className="h-52">{articlesLoading ? <Spinner /> : <EmptyChart />}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perSiteData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="site" tick={{ fontSize: 11, fill: tickColor }} />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="published" name="Published" stackId="a" fill="#10b981" />
                <Bar dataKey="pending"   name="Pending"   stackId="a" fill="#f59e0b" />
                <Bar dataKey="removed"   name="Removed"   stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* AI score histogram */}
        <Card>
          <SectionTitle>AI score distribution</SectionTitle>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 -mt-2">
            Buckets 0–100% · <span className="text-emerald-600 dark:text-emerald-400">green ≥ 70%</span>
            , <span className="text-amber-500">yellow ≥ 50%</span>
            , <span className="text-red-500">red &lt; 50%</span>
          </p>
          {allArticles.filter(a => a.ai_score != null).length === 0 ? (
            <div className="h-52"><EmptyChart message="No scored articles yet" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: tickColor }} unit="%" />
                <YAxis tick={{ fontSize: 11, fill: tickColor }} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="count" name="Articles" radius={[4, 4, 0, 0]}>
                  {scoreData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── 4. AI Quality row — avg score per site + donut ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">

        {/* Avg score per site (horizontal bar) */}
        <Card className="xl:col-span-2">
          <SectionTitle>Average AI score per site</SectionTitle>
          {avgScorePerSite.length === 0 ? (
            <div className="h-40"><EmptyChart message="No scored articles yet" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, avgScorePerSite.length * 44)}>
              <BarChart
                data={avgScorePerSite}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: tickColor }}
                  tickFormatter={v => `${Math.round(v * 100)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="site"
                  tick={{ fontSize: 11, fill: tickColor }}
                  width={110}
                />
                <Tooltip
                  {...tooltipProps}
                  formatter={v => [`${Math.round(v * 100)}%`, 'Avg score']}
                />
                <Bar dataKey="avg" name="Avg score" radius={[0, 4, 4, 0]}>
                  {avgScorePerSite.map((entry, i) => (
                    <Cell key={i} fill={entry.avg >= 0.7 ? '#10b981' : entry.avg >= 0.5 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Auto-publish vs review donut */}
        <Card>
          <SectionTitle>Auto-publish ratio</SectionTitle>
          {donutData.length === 0 ? (
            <div className="h-48"><EmptyChart message="No scored articles yet" /></div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [v, name]}
                    contentStyle={{
                      background: isDark ? '#1f2937' : '#fff',
                      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs mt-1">
                {donutData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DONUT_COLORS[i] }} />
                    <span className="text-gray-600 dark:text-gray-400">{d.name}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── 5. Scrape Activity ────────────────────────────────────────────────── */}
      <Card className="mb-5">
        <SectionTitle
          action={
            <Link
              to="/admin/scrape-jobs"
              className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
            >
              Manage jobs →
            </Link>
          }
        >
          Scrape activity
        </SectionTitle>
        {jobsLoading ? (
          <Spinner />
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No scrape jobs configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                  <th className="pb-2 pr-4">Site</th>
                  <th className="pb-2 pr-4">Keywords</th>
                  <th className="pb-2 pr-4">Freq</th>
                  <th className="pb-2 pr-4">Last run</th>
                  <th className="pb-2 pr-4">Saved</th>
                  <th className="pb-2 pr-4">Next run</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {jobs.map(job => {
                  const siteName = siteMap[job.site_id] || `Site ${job.site_id}`
                  const isFailed = job.status === 'failed'
                  const isRunning = runningJobIds.has(job.id) || job.status === 'running'
                  return (
                    <tr
                      key={job.id}
                      className={`${isFailed ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}
                    >
                      <td className="py-2.5 pr-4 font-medium text-gray-800 dark:text-gray-200 max-w-[120px] truncate">
                        {siteName}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400 max-w-[160px] truncate">
                        {(job.keywords ?? []).join(', ')}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400">
                        <FreqLabel minutes={job.frequency_minutes} />
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {job.last_run ? timeAgo(job.last_run) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-center">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {job.scraped_count ?? 0}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {nextRun(job)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_BADGE[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {job.status}
                        </span>
                        {isFailed && job.error_message && (
                          <span
                            className="ml-1 text-xs text-red-500 dark:text-red-400 truncate max-w-[180px] inline-block align-bottom"
                            title={job.error_message}
                          >
                            {job.error_message.slice(0, 40)}…
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => handleRunJob(job.id)}
                          disabled={isRunning}
                          className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                          {isRunning ? '…' : 'Run now'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── 6 & 7. Bottom row: Recent Activity | Trends + Alerts ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Recent Activity Feed */}
        <Card className="xl:col-span-2">
          <SectionTitle
            action={
              <Link
                to="/cms/articles"
                className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
              >
                View all →
              </Link>
            }
          >
            Recent articles
          </SectionTitle>
          {articlesLoading ? (
            <Spinner />
          ) : recentArticles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No articles yet.</p>
          ) : (
            <div className="space-y-1">
              {recentArticles.map(a => (
                <Link
                  key={a.id}
                  to={`/cms/articles/${a.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {a.title || `Article #${a.id}`}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {siteMap[a.site_id] || `Site ${a.site_id}`} · {timeAgo(a.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.ai_score != null && <AiScoreBadge score={a.ai_score} />}
                    <StatusBadge status={a.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Right column: Trends + Alerts stacked */}
        <div className="flex flex-col gap-5">

          {/* Trends Snapshot */}
          <Card>
            <SectionTitle
              action={
                <Link
                  to="/admin/trends"
                  className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
                >
                  View all →
                </Link>
              }
            >
              Trending today
            </SectionTitle>
            {topTrends.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No active trends.</p>
            ) : (
              <div className="space-y-3">
                {topTrends.slice(0, 3).map(t => (
                  <div key={t.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate mr-2">
                        {t.keyword}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {t.region ?? ''}
                      </span>
                    </div>
                    <TrendScoreBar score={t.score} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* System Alerts Summary */}
          <Card>
            <SectionTitle
              action={
                <Link
                  to="/admin/alerts"
                  className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
                >
                  View all →
                </Link>
              }
            >
              System alerts
            </SectionTitle>
            {/* Unread count summary */}
            {alertsData && (
              <div className="mb-3">
                {alertsData.unread_count === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    ● All systems normal
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ● {alertsData.unread_count} unread alert{alertsData.unread_count !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
            {(alertsData?.alerts ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 italic">No unread alerts.</p>
            ) : (
              <div className="space-y-2">
                {(alertsData.alerts ?? []).map(alert => {
                  const levelCls = isDark
                    ? ALERT_LEVEL_COLORS_DARK[alert.level] ?? 'bg-gray-700 text-gray-300'
                    : (ALERT_LEVEL_COLORS[alert.level]?.badge ?? 'bg-gray-100 text-gray-600')
                  return (
                    <div
                      key={alert.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/40"
                    >
                      <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 ${levelCls}`}>
                        {alert.level}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {alert.title}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {timeAgo(alert.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
