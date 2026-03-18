/**
 * HealthThermometer — compact SVG thermometer showing system alert severity.
 *
 * Size: 14×40px — designed to sit inline next to a header title.
 *
 * Color/fill logic (highest severity wins):
 *   green  (normal)   — no unread alerts        — fill 20%
 *   blue   (info)     — info alerts only         — fill 40%
 *   orange (warning)  — at least one warning     — fill 70%
 *   red    (critical) — at least one critical    — fill 95%
 *
 * Pulse animation when non-green.
 * Tooltip on hover: "X critical, Y warnings, Z info" or "All systems normal".
 * On click: calls onToggle() — intended to open the AlertBell dropdown.
 * Fetches /admin/alerts?is_read=false&limit=100 every 30 seconds.
 * Silently hides on auth errors (non-admin users).
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { useTheme } from '../context/ThemeContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  normal:   { fillLevel: 0.20, fillColor: '#22c55e', gradientTop: '#86efac' },
  info:     { fillLevel: 0.40, fillColor: '#3b82f6', gradientTop: '#93c5fd' },
  warning:  { fillLevel: 0.70, fillColor: '#f97316', gradientTop: '#fdba74' },
  critical: { fillLevel: 0.95, fillColor: '#ef4444', gradientTop: '#fca5a5' },
}

// SVG geometry (viewBox 0 0 14 40)
const TUBE_X        = 4.5   // tube outline left edge
const TUBE_WIDTH    = 5     // tube outline width
const TUBE_Y_TOP    = 1.5   // tube outline top
const TUBE_HEIGHT   = 26    // tube outline height
const TUBE_RX       = 2.5   // tube corner radius
const INNER_X       = 5.5   // fill area left
const INNER_WIDTH   = 3     // fill area width
const INNER_Y_TOP   = 3     // fill area top (inside tube)
const INNER_Y_BOT   = 26    // fill area bottom (where tube meets bulb)
const INNER_HEIGHT  = INNER_Y_BOT - INNER_Y_TOP  // 23
const BULB_CX       = 7
const BULB_CY       = 33
const BULB_R        = 5     // outer bulb radius
const BULB_FILL_R   = 4     // inner fill radius

// Tick marks (right side of tube)
const TICKS = [7, 12, 17, 22]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveSeverity(alerts) {
  if (!alerts || alerts.length === 0) return 'normal'
  if (alerts.some(a => a.level === 'critical')) return 'critical'
  if (alerts.some(a => a.level === 'warning'))  return 'warning'
  return 'info'
}

function buildTooltip(alerts) {
  if (!alerts || alerts.length === 0) return 'All systems normal'
  const critical = alerts.filter(a => a.level === 'critical').length
  const warning  = alerts.filter(a => a.level === 'warning').length
  const info     = alerts.filter(a => a.level === 'info').length
  const parts = []
  if (critical) parts.push(`${critical} critical`)
  if (warning)  parts.push(`${warning} warning${warning !== 1 ? 's' : ''}`)
  if (info)     parts.push(`${info} info`)
  return parts.join(', ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthThermometer({ onToggle }) {
  const { isDark } = useTheme()
  const [showTooltip, setShowTooltip] = useState(false)

  const { data, isError } = useQuery({
    queryKey:       ['alerts-thermometer'],
    queryFn:        () => api.get('/admin/alerts', { params: { is_read: false, limit: 100 } }).then(r => r.data),
    refetchInterval: 30_000,
    retry:           false,   // don't retry on 403 (non-admin users)
  })

  // Hide silently if auth error (non-admin) or still loading first time with no data
  if (isError) return null

  const alerts   = data?.alerts ?? []
  const severity = deriveSeverity(alerts)
  const tooltip  = buildTooltip(alerts)
  const { fillLevel, fillColor, gradientTop } = SEVERITY_CONFIG[severity]

  // Compute fill geometry
  const fillHeight = Math.round(INNER_HEIGHT * fillLevel * 10) / 10
  const fillY      = INNER_Y_BOT - fillHeight

  // Colours
  const bgColor     = isDark ? '#374151' : '#e5e7eb'
  const strokeColor = isDark ? '#4b5563' : '#d1d5db'
  const tickColor   = isDark ? '#6b7280' : '#9ca3af'

  const gradId = `thermo-${severity}-${isDark ? 'dark' : 'light'}`

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={onToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          severity !== 'normal' ? 'animate-pulse' : ''
        }`}
        title={tooltip}
        aria-label={`System health: ${tooltip}`}
        style={{ lineHeight: 0 }}
      >
        <svg
          width="14"
          height="40"
          viewBox="0 0 14 40"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientTop} />
              <stop offset="100%" stopColor={fillColor} />
            </linearGradient>
            <clipPath id={`clip-tube-${severity}`}>
              <rect
                x={INNER_X}
                y={INNER_Y_TOP}
                width={INNER_WIDTH}
                height={INNER_HEIGHT}
                rx="1.5"
              />
            </clipPath>
          </defs>

          {/* Tube background */}
          <rect
            x={TUBE_X}
            y={TUBE_Y_TOP}
            width={TUBE_WIDTH}
            height={TUBE_HEIGHT}
            rx={TUBE_RX}
            fill={bgColor}
            stroke={strokeColor}
            strokeWidth="0.6"
          />

          {/* Bulb background */}
          <circle
            cx={BULB_CX}
            cy={BULB_CY}
            r={BULB_R}
            fill={bgColor}
            stroke={strokeColor}
            strokeWidth="0.6"
          />

          {/* Fill — tube (clipped to inner area) */}
          {fillHeight > 0 && (
            <rect
              x={INNER_X}
              y={fillY}
              width={INNER_WIDTH}
              height={fillHeight + 2}  // +2 to connect visually to bulb
              fill={`url(#${gradId})`}
              clipPath={`url(#clip-tube-${severity})`}
            />
          )}

          {/* Fill — bulb (always filled with base color) */}
          <circle
            cx={BULB_CX}
            cy={BULB_CY}
            r={BULB_FILL_R}
            fill={fillColor}
          />

          {/* Tick marks */}
          {TICKS.map(y => (
            <line
              key={y}
              x1={TUBE_X + TUBE_WIDTH}
              y1={y}
              x2={TUBE_X + TUBE_WIDTH + 2}
              y2={y}
              stroke={tickColor}
              strokeWidth="0.8"
            />
          ))}
        </svg>
      </button>

      {/* Custom tooltip */}
      {showTooltip && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[100] px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap shadow-lg pointer-events-none ${
            isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-900 text-white'
          }`}
        >
          {tooltip}
          {/* Arrow */}
          <div
            className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${
              isDark ? 'border-t-gray-700' : 'border-t-gray-900'
            }`}
          />
        </div>
      )}
    </div>
  )
}
