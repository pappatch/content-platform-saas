/**
 * API Services & Costs dashboard — /admin/api-usage
 *
 * Shows one card per external service with:
 *   - Status badge (green / yellow / red)
 *   - Calls today & this month
 *   - Estimated cost this month + projected end-of-month
 *   - Credits remaining (Stability AI)
 *   - Token breakdown (Anthropic)
 *   - 7-day sparkline (recharts AreaChart)
 *
 * Summary bar at top shows total estimated monthly spend.
 */

import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts'
import api from '../../api/client'
import Spinner from '../../components/Spinner'
import { useTheme } from '../../context/ThemeContext'

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

const fetchApiUsage = () => api.get('/admin/api-usage').then(r => r.data)

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function fmtCost(usd) {
  if (usd === 0) return 'Free'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function fmtNum(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortDate(iso) {
  // "2026-03-09" → "Mar 9"
  const [, m, d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`
}

// Status → Tailwind colour classes
function statusColors(status, isDark) {
  if (status === 'ok')      return isDark ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'warning') return isDark ? 'bg-amber-900/40 text-amber-300 border-amber-700'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
  /* error */               return isDark ? 'bg-red-900/40 text-red-300 border-red-700'
                                          : 'bg-red-50 text-red-700 border-red-200'
}

function statusBadge(status) {
  if (status === 'ok')      return { label: 'OK',      cls: 'bg-emerald-100 text-emerald-700' }
  if (status === 'warning') return { label: 'Warning', cls: 'bg-amber-100 text-amber-700'   }
  return                           { label: 'Error',   cls: 'bg-red-100 text-red-700'       }
}

// Sparkline fill colours per status
function sparkColor(status) {
  if (status === 'ok')      return '#10b981'
  if (status === 'warning') return '#f59e0b'
  return '#ef4444'
}

// ---------------------------------------------------------------------------
// Sparkline mini-chart (recharts AreaChart, no axes)
// ---------------------------------------------------------------------------

function Sparkline({ data, status }) {
  const color = sparkColor(status)
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`sg-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.0}  />
          </linearGradient>
        </defs>
        <RechartsTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <div className="text-xs bg-white border border-gray-200 rounded px-2 py-1 shadow">
                <div className="font-medium">{shortDate(d.date)}</div>
                <div>{d.calls} call{d.calls !== 1 ? 's' : ''}</div>
              </div>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="calls"
          stroke={color}
          strokeWidth={1.8}
          fill={`url(#sg-${status})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Service icons (text-based — no external deps)
// ---------------------------------------------------------------------------

const SERVICE_META = {
  anthropic:      { icon: '🤖', label: 'Anthropic' },
  stability_ai:   { icon: '🎨', label: 'Stability AI' },
  unsplash:       { icon: '🖼',  label: 'Unsplash' },
  tavily:         { icon: '🔍', label: 'Tavily' },
  google_cse:     { icon: '🔎', label: 'Google CSE' },
  google_trends:  { icon: '📈', label: 'Google Trends' },
}

// ---------------------------------------------------------------------------
// Single service card
// ---------------------------------------------------------------------------

function ServiceCard({ svc, isDark }) {
  const badge  = statusBadge(svc.status)
  const colors = statusColors(svc.status, isDark)
  const meta   = SERVICE_META[svc.id] || { icon: '🔌', label: svc.name }

  const cardBase = isDark
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200'

  const labelCls = isDark ? 'text-gray-400' : 'text-gray-500'
  const valCls   = isDark ? 'text-gray-100' : 'text-gray-900'

  return (
    <div className={`rounded-xl border ${cardBase} p-4 flex flex-col gap-3`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{meta.icon}</span>
          <div>
            <div className={`text-sm font-semibold ${valCls}`}>{svc.name}</div>
            {!svc.configured && (
              <div className="text-xs text-red-500 mt-0.5">No API key</div>
            )}
          </div>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Stats row */}
      <div className={`rounded-lg border ${colors} px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1`}>
        <Stat label="Today"       value={fmtNum(svc.calls_today)}     labelCls={labelCls} valCls={valCls} />
        <Stat label="This month"  value={fmtNum(svc.calls_month)}     labelCls={labelCls} valCls={valCls} />
        <Stat label="Cost MTD"    value={fmtCost(svc.cost_month)}     labelCls={labelCls} valCls={valCls} />
        <Stat label="Proj. EOM"   value={fmtCost(svc.cost_projected_eom)} labelCls={labelCls} valCls={valCls} />
        {svc.credits_remaining != null && (
          <Stat
            label="Credits left"
            value={svc.credits_remaining.toFixed(2)}
            labelCls={labelCls}
            valCls={svc.credits_remaining < 5 ? 'text-amber-500 font-semibold' : valCls}
          />
        )}
        {svc.calls_last_hour != null && (
          <Stat
            label={`Last hour / ${svc.rate_limit_hourly}`}
            value={`${svc.calls_last_hour} / ${svc.rate_limit_hourly}`}
            labelCls={labelCls}
            valCls={valCls}
          />
        )}
        {svc.daily_quota != null && (
          <Stat
            label={`Today / ${svc.daily_quota} limit`}
            value={`${svc.calls_today} / ${svc.daily_quota}`}
            labelCls={labelCls}
            valCls={svc.calls_today >= svc.daily_quota ? 'text-red-500 font-semibold' : valCls}
          />
        )}
        {svc.input_tokens_month != null && (
          <>
            <Stat label="Input tokens"  value={fmtNum(svc.input_tokens_month)}  labelCls={labelCls} valCls={valCls} />
            <Stat label="Output tokens" value={fmtNum(svc.output_tokens_month)} labelCls={labelCls} valCls={valCls} />
          </>
        )}
      </div>

      {/* Sparkline */}
      <div>
        <div className={`text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>
          Last 7 days
        </div>
        <Sparkline data={svc.sparkline} status={svc.status} />
      </div>
    </div>
  )
}

function Stat({ label, value, labelCls, valCls }) {
  return (
    <div>
      <div className={`text-[10px] ${labelCls}`}>{label}</div>
      <div className={`text-sm font-semibold ${valCls}`}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ total, projected, isDark }) {
  const cardBase = isDark ? 'bg-indigo-900/40 border-indigo-700' : 'bg-indigo-50 border-indigo-200'
  const titleCls = isDark ? 'text-indigo-300' : 'text-indigo-700'
  const valCls   = isDark ? 'text-white' : 'text-indigo-900'
  const subCls   = isDark ? 'text-indigo-400' : 'text-indigo-500'

  return (
    <div className={`rounded-xl border ${cardBase} px-5 py-4 flex flex-wrap gap-6 items-center`}>
      <div>
        <div className={`text-xs uppercase tracking-wider ${titleCls}`}>
          Total spend this month
        </div>
        <div className={`text-2xl font-bold mt-0.5 ${valCls}`}>{fmtCost(total)}</div>
      </div>
      <div className={`w-px h-10 ${isDark ? 'bg-indigo-700' : 'bg-indigo-200'}`} />
      <div>
        <div className={`text-xs uppercase tracking-wider ${titleCls}`}>
          Projected end-of-month
        </div>
        <div className={`text-2xl font-bold mt-0.5 ${valCls}`}>{fmtCost(projected)}</div>
      </div>
      <div className={`ml-auto text-xs ${subCls}`}>
        Based on month-to-date daily average
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ApiUsage() {
  const { isDark } = useTheme()

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['api-usage'],
    queryFn: fetchApiUsage,
    staleTime: 60_000,
  })

  const titleCls = isDark ? 'text-gray-100' : 'text-gray-900'
  const subCls   = isDark ? 'text-gray-400' : 'text-gray-500'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-semibold ${titleCls}`}>API Services & Costs</h1>
          <p className={`text-sm mt-0.5 ${subCls}`}>
            Live usage and estimated spend across all integrated external services
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50
                     transition-colors"
        >
          {isFetching ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}
              viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {/* Loading / error states */}
      {isLoading && <Spinner />}
      {isError && (
        <div className="text-red-500 text-sm">
          Failed to load API usage data. Is the backend running?
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <SummaryBar
            total={data.total_cost_month}
            projected={data.total_cost_projected_eom}
            isDark={isDark}
          />

          {/* Service cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.services.map(svc => (
              <ServiceCard key={svc.id} svc={svc} isDark={isDark} />
            ))}
          </div>

          {/* Footer */}
          <p className={`text-xs ${subCls}`}>
            Last updated: {new Date(data.generated_at).toLocaleString()} ·
            Costs are estimates based on published pricing. Actual billing may differ.
          </p>
        </>
      )}
    </div>
  )
}
