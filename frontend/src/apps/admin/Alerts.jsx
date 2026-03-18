/**
 * Alerts — full system alerts page at /admin/alerts
 *
 * Features:
 * - Filter by level (all / critical / warning / info)
 * - Filter by read status (all / unread / read)
 * - Bulk "Mark all read" button
 * - Per-alert "Mark read" and "Delete" actions
 * - Checkbox selection + "Delete selected" bulk action
 * - "Delete all info" / "Delete all" bulk delete buttons
 * - Level colour coding + source badge
 * - Timestamps with relative time
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import Spinner from '../../components/Spinner'
import { useTheme } from '../../context/ThemeContext'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function buildParams({ level, isRead, limit, offset }) {
  const params = { limit, offset }
  if (level   !== 'all')  params.level   = level
  if (isRead  !== 'all')  params.is_read = isRead === 'unread' ? false : true
  return params
}

const fetchAlerts = (params) =>
  api.get('/admin/alerts', { params }).then(r => r.data)

const markAllRead = () =>
  api.patch('/admin/alerts/read-all').then(r => r.data)

const markOneRead = (id) =>
  api.patch(`/admin/alerts/${id}/read`).then(r => r.data)

const deleteAlert = (id) =>
  api.delete(`/admin/alerts/${id}`).then(r => r.data)

const deleteBulk = (ids) =>
  api.delete('/admin/alerts/bulk', { data: { ids } }).then(r => r.data)

const deleteAll = (level) => {
  const params = level && level !== 'all' ? { level } : {}
  return api.delete('/admin/alerts/all', { params }).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_META = {
  critical: {
    label:  'Critical',
    badge:  'bg-red-100 text-red-800',
    border: 'border-l-4 border-red-500',
    dot:    'bg-red-500',
    icon:   '🔴',
  },
  warning: {
    label:  'Warning',
    badge:  'bg-amber-100 text-amber-800',
    border: 'border-l-4 border-amber-400',
    dot:    'bg-amber-400',
    icon:   '🟠',
  },
  info: {
    label:  'Info',
    badge:  'bg-blue-100 text-blue-800',
    border: 'border-l-4 border-blue-400',
    dot:    'bg-blue-400',
    icon:   '🔵',
  },
}

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtDatetime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterButton({ active, onClick, children }) {
  const { isDark } = useTheme()
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : isDark
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function AlertRow({ alert, selected, onToggleSelect, onMarkRead, onDelete }) {
  const { isDark } = useTheme()
  const meta = LEVEL_META[alert.level] ?? LEVEL_META.info

  return (
    <div
      className={`relative p-4 rounded-xl border ${meta.border} ${
        selected
          ? isDark ? 'bg-indigo-900/30 border-indigo-500' : 'bg-indigo-50 border-indigo-300'
          : alert.is_read
            ? isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
            : isDark ? 'bg-gray-750 border-gray-700' : 'bg-white border-gray-200'
      } shadow-sm`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(alert.id)}
          className="mt-1.5 w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer shrink-0"
          aria-label={`Select alert: ${alert.title}`}
        />

        {/* Level dot */}
        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot} ${alert.is_read ? 'opacity-40' : ''}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
              {meta.icon} {meta.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
              isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>
              {alert.source}
            </span>
            {alert.is_read && (
              <span className="text-xs text-gray-400">✓ read</span>
            )}
            <span className={`ml-auto text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {relativeTime(alert.created_at)}
            </span>
          </div>

          <h3 className={`text-sm font-semibold mb-1 ${
            alert.is_read
              ? isDark ? 'text-gray-400' : 'text-gray-500'
              : isDark ? 'text-white'   : 'text-gray-900'
          }`}>
            {alert.title}
          </h3>

          <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {alert.message}
          </p>

          <div className={`mt-2 text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Created: {fmtDatetime(alert.created_at)}
            {alert.resolved_at && ` · Resolved: ${fmtDatetime(alert.resolved_at)}`}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!alert.is_read && (
            <button
              onClick={() => onMarkRead(alert.id)}
              title="Mark as read"
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                isDark
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              ✓
            </button>
          )}
          <button
            onClick={() => onDelete(alert.id)}
            title="Delete alert"
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              isDark
                ? 'text-gray-400 hover:bg-red-900/40 hover:text-red-400'
                : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
            }`}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function Alerts() {
  const { isDark } = useTheme()
  const qc = useQueryClient()

  const [level,    setLevel]    = useState('all')
  const [isRead,   setIsRead]   = useState('all')
  const [page,     setPage]     = useState(0)
  const [selected, setSelected] = useState(new Set())

  const params = buildParams({
    level, isRead,
    limit:  PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey:       ['alerts', level, isRead, page],
    queryFn:        () => fetchAlerts(params),
    refetchInterval: 30_000,
  })

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['alerts'] })
    qc.invalidateQueries({ queryKey: ['alerts-bell'] })
    qc.invalidateQueries({ queryKey: ['alerts-thermometer'] })
  }

  const markAllMut = useMutation({ mutationFn: markAllRead, onSuccess: invalidateAll })
  const markOneMut = useMutation({ mutationFn: markOneRead, onSuccess: invalidateAll })
  const deleteMut  = useMutation({
    mutationFn: deleteAlert,
    onSuccess: (_, id) => {
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
      invalidateAll()
    },
  })
  const deleteBulkMut = useMutation({
    mutationFn: deleteBulk,
    onSuccess: () => { setSelected(new Set()); invalidateAll() },
  })
  const deleteAllMut = useMutation({ mutationFn: deleteAll, onSuccess: () => { setSelected(new Set()); invalidateAll() } })

  const alerts      = data?.alerts       ?? []
  const total       = data?.total        ?? 0
  const unread      = data?.unread_count ?? 0
  const totalPages  = Math.ceil(total / PAGE_SIZE)

  const allCurrentSelected = alerts.length > 0 && alerts.every(a => selected.has(a.id))
  const someSelected       = selected.size > 0

  function toggleSelectAll() {
    if (allCurrentSelected) {
      setSelected(s => {
        const n = new Set(s)
        alerts.forEach(a => n.delete(a.id))
        return n
      })
    } else {
      setSelected(s => {
        const n = new Set(s)
        alerts.forEach(a => n.add(a.id))
        return n
      })
    }
  }

  function toggleOne(id) {
    setSelected(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const hasInfo = alerts.some(a => a.level === 'info')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            System Alerts
          </h1>
          <p className={`mt-0.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {unread > 0 ? `${unread} unread alert${unread !== 1 ? 's' : ''}` : 'All caught up'}
            {total > 0 && ` · ${total} total`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {someSelected && (
            <button
              onClick={() => deleteBulkMut.mutate([...selected])}
              disabled={deleteBulkMut.isPending}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleteBulkMut.isPending ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          )}
          {hasInfo && (
            <button
              onClick={() => deleteAllMut.mutate('info')}
              disabled={deleteAllMut.isPending}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${
                isDark
                  ? 'bg-gray-700 text-blue-400 hover:bg-gray-600'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Delete all info
            </button>
          )}
          {total > 0 && (
            <button
              onClick={() => deleteAllMut.mutate('all')}
              disabled={deleteAllMut.isPending}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${
                isDark
                  ? 'bg-gray-700 text-red-400 hover:bg-gray-600'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              {deleteAllMut.isPending ? 'Deleting…' : 'Delete all'}
            </button>
          )}
          {unread > 0 && (
            <button
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {markAllMut.isPending ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className={`p-4 rounded-xl border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`}>
        <div className="flex flex-wrap gap-4">
          {/* Level filter */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Level:</span>
            <div className="flex gap-1">
              {['all', 'critical', 'warning', 'info'].map(l => (
                <FilterButton key={l} active={level === l} onClick={() => { setLevel(l); setPage(0); setSelected(new Set()) }}>
                  {l === 'all' ? 'All' : (LEVEL_META[l]?.icon + ' ' + LEVEL_META[l]?.label)}
                </FilterButton>
              ))}
            </div>
          </div>

          {/* Read status filter */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Status:</span>
            <div className="flex gap-1">
              {[['all', 'All'], ['unread', 'Unread'], ['read', 'Read']].map(([val, lbl]) => (
                <FilterButton key={val} active={isRead === val} onClick={() => { setIsRead(val); setPage(0); setSelected(new Set()) }}>
                  {lbl}
                </FilterButton>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : isError ? (
        <div className="text-center py-12 text-red-500 text-sm">Failed to load alerts.</div>
      ) : alerts.length === 0 ? (
        <div className={`text-center py-16 rounded-xl border ${
          isDark ? 'bg-gray-800 border-gray-700 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}>
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-sm font-medium">No alerts matching your filters</p>
          <p className="text-xs mt-1 opacity-70">Alerts are generated automatically by the log analyzer every 5 minutes.</p>
        </div>
      ) : (
        <>
          {/* Select-all row */}
          <div className={`flex items-center gap-3 px-2 py-1 rounded-lg ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <input
              type="checkbox"
              checked={allCurrentSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer"
              aria-label="Select all alerts on this page"
            />
            <span className="text-xs">
              {someSelected
                ? `${selected.size} selected`
                : `Select all on this page (${alerts.length})`}
            </span>
          </div>

          <div className="space-y-3">
            {alerts.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                selected={selected.has(alert.id)}
                onToggleSelect={toggleOne}
                onMarkRead={id => markOneMut.mutate(id)}
                onDelete={id => deleteMut.mutate(id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
              isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ← Prev
          </button>
          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
              isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
