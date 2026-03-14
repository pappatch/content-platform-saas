import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { useAuth } from '../../hooks/useAuth'
import { getArticleStats, getArticles } from '../../services/articles'
import { getSites } from '../../services/sites'
import api from '../../api/client'
import Spinner from '../../components/Spinner'

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const getAnalyticsEvents = () => api.get('/analytics').then((r) => r.data)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_META = [
  { key: 'published', label: 'Published',    color: '#10b981', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  { key: 'pending',   label: 'Pending Review', color: '#f59e0b', bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  { key: 'removed',   label: 'Removed',      color: '#ef4444', bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  { key: 'total',     label: 'Total',        color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
]

const LINE_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

// Score bucket → colour: red below 0.5, yellow 0.5–0.7, green above
function scoreBucketColor(idx) {
  const mid = idx * 0.1 + 0.05   // midpoint of bucket (0.05, 0.15, …)
  if (mid >= 0.7) return '#10b981'
  if (mid >= 0.5) return '#f59e0b'
  return '#ef4444'
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value, bg, text, border, loading }) {
  return (
    <div className={`card border ${border} ${bg}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{label}</div>
      <div className={`mt-1 text-3xl font-bold ${text}`}>
        {loading ? '…' : (value ?? '—')}
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
      {children}
    </h2>
  )
}

function EmptyChart({ message = 'No data yet' }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400 italic">
      {message}
    </div>
  )
}

// Custom tooltip that matches the admin style
function StyledTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const { user } = useAuth()

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['article-stats'],
    queryFn: () => getArticleStats(),
  })

  const { data: allArticles = [], isLoading: articlesLoading } = useQuery({
    queryKey: ['cms-articles-dashboard'],
    queryFn: () => getArticles(),
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['analytics-events'],
    queryFn: getAnalyticsEvents,
  })

  // ── Derived data ─────────────────────────────────────────────────────────

  const siteMap = useMemo(
    () => Object.fromEntries(sites.map((s) => [s.id, s.name])),
    [sites],
  )

  // Bar chart: total + published + pending per site
  const perSiteData = useMemo(() => {
    const acc = {}
    for (const a of allArticles) {
      const name = siteMap[a.site_id] || `Site ${a.site_id}`
      if (!acc[name]) acc[name] = { site: name, published: 0, pending: 0, removed: 0 }
      acc[name][a.status] = (acc[name][a.status] || 0) + 1
    }
    return Object.values(acc).sort((a, b) =>
      (b.published + b.pending + b.removed) - (a.published + a.pending + a.removed)
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

  // Unique site names that appear in analytics events
  const eventSiteNames = useMemo(
    () => [...new Set(events.map((e) => siteMap[e.site_id] || `Site ${e.site_id}`))],
    [events, siteMap],
  )

  // Line chart: page views per day per site (last 30 days)
  const pageViewsData = useMemo(() => {
    // Build a slot for each of the last 30 days
    const days = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      days[key] = { date: label }
      for (const name of eventSiteNames) days[key][name] = 0
    }

    for (const e of events) {
      const day = (e.created_at || '').slice(0, 10)
      if (days[day]) {
        const name = siteMap[e.site_id] || `Site ${e.site_id}`
        days[day][name] = (days[day][name] || 0) + 1
      }
    }

    return Object.values(days)
  }, [events, siteMap, eventSiteNames])

  const totalPageViews = events.length
  const isLoading = statsLoading || articlesLoading || eventsLoading

  if (isLoading) return <Spinner />

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.email}</p>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STATUS_META.map(({ key, label, bg, text, border }) => (
          <StatCard
            key={key}
            label={label}
            value={stats?.[key]}
            bg={bg}
            text={text}
            border={border}
            loading={statsLoading}
          />
        ))}
      </div>

      {/* ── Charts row 1 ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

        {/* Articles per site */}
        <div className="card">
          <SectionTitle>Articles per site</SectionTitle>
          {perSiteData.length === 0 ? (
            <div className="h-52"><EmptyChart /></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perSiteData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="site" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip content={<StyledTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="published" name="Published" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending"   name="Pending"   stackId="a" fill="#f59e0b" />
                <Bar dataKey="removed"   name="Removed"   stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* AI score distribution */}
        <div className="card">
          <SectionTitle>AI score distribution</SectionTitle>
          <p className="text-xs text-gray-400 mb-3 -mt-2">
            Score buckets 0–100% · green ≥ 70%, yellow ≥ 50%, red &lt; 50%
          </p>
          {allArticles.filter((a) => a.ai_score != null).length === 0 ? (
            <div className="h-52"><EmptyChart message="No scored articles yet" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#6b7280' }} unit="%" />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                <Tooltip content={<StyledTooltip />} />
                <Bar dataKey="count" name="Articles" radius={[4, 4, 0, 0]}>
                  {scoreData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Page views over time ──────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Page views — last 30 days</SectionTitle>
          <span className="text-xs text-gray-400">
            {totalPageViews.toLocaleString()} total event{totalPageViews !== 1 ? 's' : ''}
          </span>
        </div>
        {events.length === 0 ? (
          <div className="h-52">
            <EmptyChart message="No page view events tracked yet. Events are recorded when visitors view articles on the public site." />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={pageViewsData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                interval={Math.floor(pageViewsData.length / 6)}
              />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip content={<StyledTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {eventSiteNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={LINE_PALETTE[i % LINE_PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
