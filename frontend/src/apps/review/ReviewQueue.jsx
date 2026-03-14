import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getArticles, updateArticle } from '../../services/articles'
import { getSites } from '../../services/sites'
import Spinner from '../../components/Spinner'

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function AiScoreBadge({ score }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const cls =
    score >= 0.7
      ? 'bg-green-100 text-green-700'
      : score >= 0.5
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}%
    </span>
  )
}

function FlagList({ flags }) {
  if (!flags.length) return <span className="text-gray-300 text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className="inline-block rounded px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 border border-orange-200"
        >
          {f}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SORT_OPTIONS = [
  { label: 'Score: high → low', value: 'score_desc' },
  { label: 'Score: low → high', value: 'score_asc' },
  { label: 'Date: newest first', value: 'date_desc' },
  { label: 'Date: oldest first', value: 'date_asc' },
]

function applySortAndFilter(articles, sort) {
  return [...articles].sort((a, b) => {
    if (sort === 'score_desc') return (b.ai_score ?? -1) - (a.ai_score ?? -1)
    if (sort === 'score_asc')  return (a.ai_score ?? 2)  - (b.ai_score ?? 2)
    if (sort === 'date_desc')  return new Date(b.created_at) - new Date(a.created_at)
    if (sort === 'date_asc')   return new Date(a.created_at) - new Date(b.created_at)
    return 0
  })
}

function parseFlags(raw) {
  try { return raw ? JSON.parse(raw) : [] }
  catch { return [] }
}

// ---------------------------------------------------------------------------
// ReviewQueue
//
// Owns: articles query (pending, 30s auto-refresh), sites query, filter/sort
//       state, and the approve mutation.
//
// Props:
//   onPreviewRequest(id)    – user clicks a table row
//   onRejectRequest(id)     – user clicks the Reject button in a row
//   onApprove(id)           – parent's approve handler (keeps mutation in sync
//                             with the preview modal's Approve button)
//   approvePendingId        – ID currently being approved (null if none)
// ---------------------------------------------------------------------------

export default function ReviewQueue({
  onPreviewRequest,
  onRejectRequest,
  onApprove,
  approvePendingId,
}) {
  const qc = useQueryClient()
  const [siteFilter, setSiteFilter] = useState('')
  const [sort, setSort] = useState('score_desc')

  // ── Queries ──────────────────────────────────────────────────────────────

  const queryParams = { status: 'pending' }
  if (siteFilter) queryParams.site_id = siteFilter

  const {
    data: rawArticles = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['review-articles', siteFilter],
    queryFn: () => getArticles(queryParams),
    refetchInterval: 30_000,
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const siteMap = useMemo(
    () => Object.fromEntries(sites.map((s) => [s.id, s.name])),
    [sites],
  )

  const articles = useMemo(() => applySortAndFilter(rawArticles, sort), [rawArticles, sort])

  // ── Render ───────────────────────────────────────────────────────────────

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Failed to load review queue.</p>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-gray-900">Review Queue</h1>
        <span className="text-xs text-gray-400">Auto-refreshes every 30 s</span>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {articles.length} article{articles.length !== 1 ? 's' : ''} pending review
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="input-field w-auto text-sm"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          className="input-field w-auto text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {siteFilter && (
          <button
            className="text-sm text-gray-500 hover:text-gray-700 underline"
            onClick={() => setSiteFilter('')}
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Empty state */}
      {articles.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-2xl mb-3 text-green-500">✓</p>
          <p className="font-medium text-gray-600">Queue is clear</p>
          <p className="text-sm text-gray-400 mt-1">No articles pending review. Check back later.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Site</th>
                <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">AI Score</th>
                <th className="px-4 py-3 font-medium text-gray-600">Flags</th>
                <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {articles.map((a) => {
                const flags = parseFlags(a.ai_flags)
                const isApprovingThis = approvePendingId === a.id
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-amber-50 transition-colors cursor-pointer"
                    onClick={() => onPreviewRequest(a.id)}
                  >
                    <td className="px-4 py-3 max-w-[260px]">
                      <span className="font-medium text-gray-900 line-clamp-2 block">
                        {a.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {siteMap[a.site_id] ?? `#${a.site_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <AiScoreBadge score={a.ai_score} />
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <FlagList flags={flags} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(a.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onApprove(a.id)}
                        disabled={isApprovingThis}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {isApprovingThis ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => onRejectRequest(a.id)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
