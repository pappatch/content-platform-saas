import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getArticles, updateArticle, removeArticle, bulkUpdateArticles } from '../../services/articles'
import { getSites } from '../../services/sites'
import { getCategories } from '../../services/categories'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import AiScoreBadge from '../../components/AiScoreBadge'
import StatusBadge from '../../components/StatusBadge'
import PinModal from '../../components/PinModal'

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

// ---------------------------------------------------------------------------
// Toast — lightweight success/error notification
// ---------------------------------------------------------------------------
function Toast({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
        px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all
        ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
    >
      <span>{type === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BulkToolbar — sticky bar shown when ≥1 article selected
// ---------------------------------------------------------------------------
function BulkToolbar({ count, categories, onPublish, onRemove, onReassign, onClear, loading }) {
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [catId, setCatId] = useState('')
  const pickerRef = useRef(null)

  // Close picker on outside click
  useEffect(() => {
    if (!showCatPicker) return
    function handle(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowCatPicker(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showCatPicker])

  function handleReassign() {
    if (!catId) return
    onReassign(Number(catId))
    setShowCatPicker(false)
    setCatId('')
  }

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 mb-4 rounded-xl
      bg-indigo-50 border border-indigo-200 shadow-sm">
      {/* Count badge */}
      <span className="flex items-center justify-center w-7 h-7 rounded-full
        bg-indigo-600 text-white text-xs font-bold shrink-0">
        {count}
      </span>
      <span className="text-sm font-medium text-indigo-800 mr-1">
        article{count !== 1 ? 's' : ''} selected
      </span>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Publish */}
        <button
          disabled={loading}
          onClick={onPublish}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
            bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          ✓ Publish
        </button>

        {/* Remove */}
        <button
          disabled={loading}
          onClick={onRemove}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
            bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          ✕ Remove
        </button>

        {/* Assign Category */}
        <div className="relative" ref={pickerRef}>
          <button
            disabled={loading}
            onClick={() => setShowCatPicker((p) => !p)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            🏷 Assign Category
            <span className="text-[10px] ml-0.5">▾</span>
          </button>

          {showCatPicker && (
            <div className="absolute left-0 top-full mt-1.5 z-30 w-64 rounded-xl shadow-xl
              bg-white border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Assign to category</p>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5
                  focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-2"
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  disabled={!catId || loading}
                  onClick={handleReassign}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold
                    bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => setShowCatPicker(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium
                    text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-amber-700 mt-2 leading-snug">
                Articles whose site doesn't match the category's site will be skipped.
              </p>
            </div>
          )}
        </div>

        {/* Clear selection */}
        <button
          onClick={onClear}
          className="px-3 py-1.5 rounded-lg text-xs font-medium
            text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
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
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false)
  const [pinModalArticle, setPinModalArticle] = useState(null)
  const [toast, setToast] = useState(null) // { message, type }

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

  function invalidateAfterBulk() {
    qc.invalidateQueries({ queryKey: ['cms-articles'] })
    qc.invalidateQueries({ queryKey: ['article-stats'] })
    setSelected(new Set())
  }

  // Single-article mutations
  const removeMut = useMutation({
    mutationFn: (id) => removeArticle(id),
    onSuccess: () => {
      invalidateAfterBulk()
      setConfirmRemoveId(null)
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

  // Bulk mutation
  const bulkMut = useMutation({
    mutationFn: ({ action, category_id }) =>
      bulkUpdateArticles([...selected], action, category_id),
    onSuccess: (result) => {
      invalidateAfterBulk()
      setConfirmBulkRemove(false)
      const msg = result.failed > 0
        ? `${result.updated} updated, ${result.failed} failed`
        : `${result.updated} article${result.updated !== 1 ? 's' : ''} updated`
      setToast({ message: msg, type: result.failed > 0 ? 'error' : 'success' })
    },
    onError: (err) => {
      setToast({ message: err?.response?.data?.detail ?? 'Bulk action failed', type: 'error' })
    },
  })

  // Selection helpers
  const allSelected = articles.length > 0 && selected.size === articles.length
  const someSelected = selected.size > 0 && !allSelected

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
      </div>

      {/* Bulk toolbar — sticky, shown when ≥1 selected */}
      {selected.size > 0 && (
        <BulkToolbar
          count={selected.size}
          categories={categories}
          loading={bulkMut.isPending}
          onPublish={() => bulkMut.mutate({ action: 'publish' })}
          onRemove={() => setConfirmBulkRemove(true)}
          onReassign={(catId) => bulkMut.mutate({ action: 'reassign-category', category_id: catId })}
          onClear={() => setSelected(new Set())}
        />
      )}

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
        />
        <input
          type="date"
          className="input-field w-auto text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
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
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    className="rounded"
                  />
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
                <tr
                  key={a.id}
                  className={`hover:bg-gray-50 transition-colors ${selected.has(a.id) ? 'bg-indigo-50/60' : ''}`}
                >
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

      {/* Single-article remove confirm */}
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

      {/* Bulk remove confirm */}
      {confirmBulkRemove && (
        <ConfirmDialog
          title={`Remove ${selected.size} article${selected.size !== 1 ? 's' : ''}?`}
          message="All selected articles will be marked as removed. You can filter by 'removed' status to find them later."
          confirmLabel="Remove all"
          loading={bulkMut.isPending}
          onConfirm={() => bulkMut.mutate({ action: 'remove' })}
          onCancel={() => setConfirmBulkRemove(false)}
        />
      )}

      {/* Pin modal */}
      {pinModalArticle && (
        <PinModal
          article={pinModalArticle}
          loading={pinUntilMut.isPending || pinMut.isPending}
          onPin={(durationMs) => {
            if (durationMs === 0) {
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

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
