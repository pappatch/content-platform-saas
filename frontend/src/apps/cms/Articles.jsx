import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getArticles, updateArticle, removeArticle } from '../../services/articles'
import { getSites } from '../../services/sites'
import { getCategories } from '../../services/categories'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'

function AiScoreBadge({ score }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const cls = score >= 0.7
    ? 'bg-green-100 text-green-700'
    : score >= 0.4
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}%
    </span>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    published: 'bg-green-100 text-green-700',
    removed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

const AI_RANGE_OPTIONS = [
  { label: 'All scores', value: '' },
  { label: '≥ 70% (high)', value: 'high' },
  { label: '40–69% (med)', value: 'med' },
  { label: '< 40% (low)', value: 'low' },
  { label: 'No score', value: 'none' },
]

function matchesAiRange(score, range) {
  if (!range) return true
  if (range === 'none') return score == null
  if (score == null) return false
  if (range === 'high') return score >= 0.7
  if (range === 'med') return score >= 0.4 && score < 0.7
  if (range === 'low') return score < 0.4
  return true
}

export default function Articles() {
  const qc = useQueryClient()

  // Server-side filters
  const [siteFilter, setSiteFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Client-side filters
  const [aiRange, setAiRange] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [selected, setSelected] = useState(new Set())
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [pinModalArticle, setPinModalArticle] = useState(null) // article object | null

  const params = {}
  if (siteFilter) params.site_id = siteFilter
  if (statusFilter) params.status = statusFilter

  const { data: allArticles = [], isLoading, isError } = useQuery({
    queryKey: ['cms-articles', siteFilter, statusFilter],
    queryFn: () => getArticles(params),
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['cms-categories'],
    queryFn: () => getCategories(),
  })

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  const articles = useMemo(() => {
    return allArticles.filter((a) => {
      if (!matchesAiRange(a.ai_score, aiRange)) return false
      if (dateFrom && new Date(a.created_at) < new Date(dateFrom)) return false
      if (dateTo && new Date(a.created_at) > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [allArticles, aiRange, dateFrom, dateTo])

  const removeMut = useMutation({
    mutationFn: (id) => removeArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
      qc.invalidateQueries({ queryKey: ['article-stats'] })
      setConfirmRemoveId(null)
      setSelected(new Set())
    },
  })

  const pinMut = useMutation({
    mutationFn: ({ id, is_pinned }) => updateArticle(id, { is_pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-articles'] }),
  })

  const pinUntilMut = useMutation({
    mutationFn: ({ id, pinned_until }) => updateArticle(id, { pinned_until }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
      setPinModalArticle(null)
    },
  })

  async function handleBulkRemove() {
    for (const id of selected) {
      await removeArticle(id)
    }
    qc.invalidateQueries({ queryKey: ['cms-articles'] })
    qc.invalidateQueries({ queryKey: ['article-stats'] })
    setSelected(new Set())
    setConfirmBulk(false)
  }

  const allSelected = articles.length > 0 && selected.size === articles.length
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(articles.map((a) => a.id)))
  }
  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Failed to load articles.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Articles</h1>
          <p className="text-sm text-gray-500 mt-0.5">{articles.length} article{articles.length !== 1 ? 's' : ''}</p>
        </div>
        {selected.size > 0 && (
          <button
            className="inline-flex items-center px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
            onClick={() => setConfirmBulk(true)}
          >
            Remove {selected.size} selected
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="input-field w-auto text-sm"
          value={siteFilter}
          onChange={(e) => { setSiteFilter(e.target.value); setSelected(new Set()) }}
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          className="input-field w-auto text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setSelected(new Set()) }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="published">Published</option>
          <option value="removed">Removed</option>
        </select>

        <select
          className="input-field w-auto text-sm"
          value={aiRange}
          onChange={(e) => { setAiRange(e.target.value); setSelected(new Set()) }}
        >
          {AI_RANGE_OPTIONS.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <input
          type="date"
          className="input-field w-auto text-sm"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
        />
        <input
          type="date"
          className="input-field w-auto text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
        />

        {(siteFilter || statusFilter || aiRange || dateFrom || dateTo) && (
          <button
            className="text-sm text-gray-500 hover:text-gray-700 underline"
            onClick={() => {
              setSiteFilter('')
              setStatusFilter('')
              setAiRange('')
              setDateFrom('')
              setDateTo('')
              setSelected(new Set())
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {articles.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm">No articles match the current filters.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 font-medium text-gray-600">Site</th>
                <th className="px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="px-4 py-3 font-medium text-gray-600">AI Score</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3 max-w-[260px]">
                    <Link
                      to={`/cms/articles/${a.id}`}
                      className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-2 block"
                    >
                      {a.title}
                    </Link>
                    {a.is_pinned && !a.pinned_until && (
                      <span className="text-xs text-indigo-500 font-medium">📌 Pinned</span>
                    )}
                    {a.pinned_until && new Date(a.pinned_until) > new Date() && (
                      <span className="text-xs text-purple-600 font-medium">
                        ⏱ Pinned until {new Date(a.pinned_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {siteMap[a.site_id] ?? `#${a.site_id}`}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {catMap[a.category_id] ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <AiScoreBadge score={a.ai_score} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(a.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                    <Link
                      to={`/cms/articles/${a.id}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => setPinModalArticle(a)}
                      className="text-gray-500 hover:text-gray-700 font-medium"
                    >
                      {a.is_pinned || (a.pinned_until && new Date(a.pinned_until) > new Date()) ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(a.id)}
                      className="text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmRemoveId !== null && (
        <ConfirmDialog
          title="Remove article?"
          message="This will mark the article as removed. You can filter by 'removed' status to find it later."
          confirmLabel="Remove"
          loading={removeMut.isPending}
          onConfirm={() => removeMut.mutate(confirmRemoveId)}
          onCancel={() => setConfirmRemoveId(null)}
        />
      )}

      {confirmBulk && (
        <ConfirmDialog
          title={`Remove ${selected.size} articles?`}
          message="All selected articles will be marked as removed."
          confirmLabel="Remove all"
          loading={false}
          onConfirm={handleBulkRemove}
          onCancel={() => setConfirmBulk(false)}
        />
      )}

      {pinModalArticle && (
        <PinModal
          article={pinModalArticle}
          loading={pinUntilMut.isPending || pinMut.isPending}
          onPin={(durationMs) => {
            if (durationMs === 0) {
              // unpin: clear both flags
              pinUntilMut.mutate({ id: pinModalArticle.id, pinned_until: null })
              pinMut.mutate({ id: pinModalArticle.id, is_pinned: false })
            } else {
              const until = new Date(Date.now() + durationMs).toISOString()
              pinUntilMut.mutate({ id: pinModalArticle.id, pinned_until: until })
            }
          }}
          onCancel={() => setPinModalArticle(null)}
        />
      )}
    </div>
  )
}

// ─── Pin Duration Modal ───────────────────────────────────────────────────────

const PIN_DURATIONS = [
  { label: '1 day',   ms: 86_400_000 },
  { label: '1 week',  ms: 7 * 86_400_000 },
  { label: '1 month', ms: 30 * 86_400_000 },
]

function PinModal({ article, loading, onPin, onCancel }) {
  const isCurrentlyPinned =
    article.is_pinned || (article.pinned_until && new Date(article.pinned_until) > new Date())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {isCurrentlyPinned ? 'Unpin article?' : 'Pin article'}
        </h3>
        <p className="text-sm text-gray-500 mb-5 line-clamp-2">{article.title}</p>

        {isCurrentlyPinned ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              This article is currently pinned. Remove the pin?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => onPin(0)}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Unpin'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">Choose how long to feature this article at the top:</p>
            <div className="flex flex-col gap-2 mb-5">
              {PIN_DURATIONS.map(({ label, ms }) => (
                <button
                  key={ms}
                  onClick={() => onPin(ms)}
                  disabled={loading}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-sm font-medium text-gray-800 transition-colors disabled:opacity-50"
                >
                  {label}
                  <span className="float-right text-gray-400 font-normal">
                    until {new Date(Date.now() + ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
