/**
 * AlertBell — persistent bell icon showing unread system alerts.
 *
 * Features:
 * - Red badge showing count of unread alerts (hidden when 0)
 * - Click to open a dropdown showing the last 10 unread alerts
 * - Level colour coding: critical=red, warning=amber, info=blue
 * - "Mark all read" button inside dropdown
 * - "View all" link to /admin/alerts
 * - "Delete all info" and "Delete all" buttons in dropdown footer
 * - Auto-refreshes every 30 seconds
 * - Supports controlled open state via isOpen / onOpenChange props
 *   (used by AlertControls to sync with HealthThermometer)
 */

import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import { useTheme } from '../context/ThemeContext'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const fetchAlerts = () =>
  api.get('/admin/alerts', { params: { limit: 10, is_read: false } }).then(r => r.data)

const markAllRead = () =>
  api.patch('/admin/alerts/read-all').then(r => r.data)

const markOneRead = (id) =>
  api.patch(`/admin/alerts/${id}/read`).then(r => r.data)

const deleteAll = (level) => {
  const params = level && level !== 'all' ? { level } : {}
  return api.delete('/admin/alerts/all', { params }).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelColors(level) {
  switch (level) {
    case 'critical': return 'bg-red-100 text-red-800 border-l-4 border-red-500'
    case 'warning':  return 'bg-amber-50 text-amber-800 border-l-4 border-amber-400'
    default:         return 'bg-blue-50 text-blue-800 border-l-4 border-blue-400'
  }
}

function levelDot(level) {
  switch (level) {
    case 'critical': return 'bg-red-500'
    case 'warning':  return 'bg-amber-400'
    default:         return 'bg-blue-400'
  }
}

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AlertBell({ isOpen: controlledOpen, onOpenChange }) {
  const { isDark } = useTheme()
  const qc = useQueryClient()
  const ref = useRef(null)

  // Support both controlled (from AlertControls) and uncontrolled usage
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  function setOpen(value) {
    const next = typeof value === 'function' ? value(open) : value
    if (isControlled && onOpenChange) {
      onOpenChange(next)
    } else {
      setInternalOpen(next)
    }
  }

  const { data } = useQuery({
    queryKey: ['alerts-bell'],
    queryFn:  fetchAlerts,
    refetchInterval: 30_000,
    retry: false,
  })

  const markAllMut = useMutation({
    mutationFn: markAllRead,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['alerts-bell'] })
      qc.invalidateQueries({ queryKey: ['alerts-thermometer'] })
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  const markOneMut = useMutation({
    mutationFn: markOneRead,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['alerts-bell'] })
      qc.invalidateQueries({ queryKey: ['alerts-thermometer'] })
    },
  })

  const deleteAllMut = useMutation({
    mutationFn: deleteAll,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['alerts-bell'] })
      qc.invalidateQueries({ queryKey: ['alerts-thermometer'] })
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const unread  = data?.unread_count ?? 0
  const alerts  = data?.alerts ?? []
  const hasInfo = alerts.some(a => a.level === 'info')

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-colors ${
          isDark
            ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
        title="System alerts"
        aria-label={`${unread} unread alerts`}
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Unread badge */}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={`absolute left-0 mt-2 w-96 rounded-xl shadow-2xl border z-50 overflow-hidden ${
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            isDark ? 'border-gray-700' : 'border-gray-100'
          }`}>
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              System Alerts {unread > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                  {unread} unread
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={() => markAllMut.mutate()}
                  disabled={markAllMut.isPending}
                  className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
              <Link
                to="/admin/alerts"
                onClick={() => setOpen(false)}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                View all →
              </Link>
            </div>
          </div>

          {/* Alert list */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100">
            {alerts.length === 0 ? (
              <div className={`px-4 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No unread alerts
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`px-4 py-3 ${levelColors(alert.level)} cursor-pointer hover:brightness-95`}
                  onClick={() => markOneMut.mutate(alert.id)}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${levelDot(alert.level)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{alert.title}</p>
                        <span className="text-[10px] opacity-70 shrink-0">{relativeTime(alert.created_at)}</span>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{alert.message}</p>
                      <span className="inline-block mt-1 text-[10px] opacity-60 uppercase tracking-wide">
                        {alert.source}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer — bulk delete actions */}
          {alerts.length > 0 && (
            <div className={`flex items-center justify-end gap-2 px-4 py-2.5 border-t ${
              isDark ? 'border-gray-700 bg-gray-850' : 'border-gray-100 bg-gray-50'
            }`}>
              {hasInfo && (
                <button
                  onClick={() => deleteAllMut.mutate('info')}
                  disabled={deleteAllMut.isPending}
                  className={`text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                    isDark
                      ? 'text-blue-400 hover:bg-blue-900/30'
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Delete all info
                </button>
              )}
              <button
                onClick={() => deleteAllMut.mutate('all')}
                disabled={deleteAllMut.isPending}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                  isDark
                    ? 'text-red-400 hover:bg-red-900/30'
                    : 'text-red-600 hover:bg-red-50'
                }`}
              >
                {deleteAllMut.isPending ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
