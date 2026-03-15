/**
 * Platform Settings — admin-only panel for tuning runtime parameters.
 *
 * Layout
 * ------
 *  Header: title + description
 *  Grouped sections: AI Review · Content Quality · Scraper · Trends
 *  Each setting row:
 *    - Key name (pretty-formatted) + description
 *    - Editable input (number for float/int, toggle for bool)
 *    - Per-row Save button with inline success / error feedback
 *    - Last updated by + timestamp (when available)
 *
 * All PATCH calls send { "value": "<string>" } — the backend validates and
 * casts to the correct type before writing to the database.
 *
 * Admin role only (enforced server-side; route is also behind ProtectedRoute).
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import Spinner from '../../components/Spinner'
import { formatDate } from '../../utils/formatDate'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const getSettings = () => api.get('/settings').then(r => r.data)

const patchSetting = ({ key, value }) =>
  api.patch(`/settings/${key}`, { value }).then(r => r.data)

// ---------------------------------------------------------------------------
// Grouping configuration
// ---------------------------------------------------------------------------

/** Maps setting keys to their display group. */
const GROUPS = [
  {
    key:   'ai_content',
    label: 'AI & Content Quality',
    icon:  '🤖',
    keys:  [
      'ai_review_threshold',
      'auto_publish_enabled',
      'ai_review_input_char_limit',
      'ai_review_max_tokens',
    ],
    note:  'Claude Haiku model parameters, auto-publish threshold, and input/output token limits.',
  },
  {
    key:   'scraper',
    label: 'Scraper',
    icon:  '🔍',
    keys:  [
      'max_searches_per_job',
      'min_paragraph_blocks',
      'min_word_count',
      'scraper_tavily_max_results',
      'scraper_google_max_results',
      'scrape_worker_interval_seconds',
    ],
    note:  'Search provider result limits, content quality gates, and scrape worker poll frequency.',
  },
  {
    key:   'images',
    label: 'Images',
    icon:  '🖼️',
    keys:  [
      'default_images_per_site',
      'image_max_candidate_pages',
      'image_worker_interval_hours',
      'image_audit_max_articles',
    ],
    note:  'Unsplash search depth, per-site default image count, worker schedule, and audit batch size.',
  },
  {
    key:   'trends',
    label: 'Trends',
    icon:  '📈',
    keys:  [
      'trends_fetch_interval_hours',
      'trends_per_region',
      'trends_auto_site_limit',
      'trends_auto_site_threshold',
      'trends_default_scrape_frequency_minutes',
    ],
    note:  'Google Trends fetch schedule, per-region topic count, site-creation limits, and quality threshold.',
  },
  {
    key:   'workers',
    label: 'Workers',
    icon:  '⚙️',
    keys:  ['review_worker_interval_seconds'],
    note:  'AI review worker poll frequency — controls how quickly pending articles are processed.',
  },
  {
    key:   'ui',
    label: 'Interface',
    icon:  '🎨',
    keys:  ['admin_theme_default'],
    note:  'Default admin panel theme for all users on first visit (light or dark).',
  },
]

// ---------------------------------------------------------------------------
// Select-option overrides — keys mapped to their allowed values
// ---------------------------------------------------------------------------

/** Settings that should render as a <select> instead of a free-text input. */
const SELECT_OPTIONS = {
  admin_theme_default: ['light', 'dark'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert snake_case key to Title Case label. */
function formatKey(key) {
  return key
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}


// ---------------------------------------------------------------------------
// SettingRow — one editable row per platform setting
// ---------------------------------------------------------------------------

function SettingRow({ setting }) {
  const qc = useQueryClient()
  const [localValue, setLocalValue] = useState(setting.value)
  const [feedback, setFeedback] = useState(null)  // null | 'saved' | 'error:<msg>'

  const isBool      = setting.value_type === 'bool'
  const isFloat     = setting.value_type === 'float'
  const isInt       = setting.value_type === 'int'
  const isString    = setting.value_type === 'string'
  const selectOpts  = SELECT_OPTIONS[setting.key] || null   // string[] | null
  const step        = isFloat ? '0.01' : '1'
  const min         = (isFloat || isInt) ? '0' : undefined

  const dirty = localValue !== setting.value

  const mut = useMutation({
    mutationFn: () => patchSetting({ key: setting.key, value: localValue }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] })
      setFeedback('saved')
      setTimeout(() => setFeedback(null), 2500)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Save failed'
      setFeedback(`error:${msg}`)
    },
  })

  function handleToggle(checked) {
    setLocalValue(checked ? 'true' : 'false')
    setFeedback(null)
  }

  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-gray-100 last:border-0">
      {/* Description column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{formatKey(setting.key)}</span>
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {setting.key}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{setting.description}</p>
        {setting.updated_at && (
          <p className="text-[10px] text-gray-400 mt-1">
            Last updated {formatDate(setting.updated_at)}
            {setting.updated_by_id ? ` · user #${setting.updated_by_id}` : ' · system default'}
          </p>
        )}
      </div>

      {/* Control + Save column */}
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        {isBool ? (
          /* Toggle */
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={localValue === 'true'}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <div className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
            <span className="ml-2 text-xs font-medium text-gray-600">
              {localValue === 'true' ? 'On' : 'Off'}
            </span>
          </label>
        ) : selectOpts ? (
          /* Select box for enum-like string settings */
          <select
            value={localValue}
            onChange={(e) => { setLocalValue(e.target.value); setFeedback(null) }}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            {selectOpts.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : isString ? (
          /* Text input for free-form string type */
          <input
            type="text"
            value={localValue}
            onChange={(e) => { setLocalValue(e.target.value); setFeedback(null) }}
            className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        ) : (
          /* Number input for float / int */
          <input
            type="number"
            value={localValue}
            step={step}
            min={min}
            onChange={(e) => { setLocalValue(e.target.value); setFeedback(null) }}
            className="w-24 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        )}

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || (!dirty && !isBool && !selectOpts)}
          title={!dirty && !isBool && !selectOpts ? 'No changes' : 'Save'}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            dirty || isBool || selectOpts
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          } disabled:opacity-60`}
        >

          {mut.isPending ? '…' : 'Save'}
        </button>

        {/* Inline feedback */}
        <div className="w-5 flex items-center justify-center">
          {feedback === 'saved' && (
            <span className="text-green-500 text-sm" title="Saved">✓</span>
          )}
          {feedback?.startsWith('error:') && (
            <span
              className="text-red-500 text-sm cursor-help"
              title={feedback.slice(6)}
            >
              ✕
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingGroup — one card per logical group
// ---------------------------------------------------------------------------

function SettingGroup({ group, settingsMap }) {
  const rows = group.keys
    .map(k => settingsMap[k])
    .filter(Boolean)

  if (rows.length === 0) return null

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Group header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">{group.icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{group.label}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{group.note}</p>
        </div>
      </div>

      {/* Setting rows */}
      <div className="px-5 divide-y-0">
        {rows.map(setting => (
          <SettingRow key={setting.key} setting={setting} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * AdminSettings — platform settings panel.
 *
 * Mounted at /admin/settings (admin role required).
 */
export default function AdminSettings() {
  const { data: settingsList = [], isLoading, isError } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: getSettings,
    staleTime: 30_000,
  })

  // Index by key for O(1) group lookup
  const settingsMap = Object.fromEntries(
    settingsList.map(s => [s.key, s])
  )

  // Any settings not matched by a group (safety net for future keys)
  const groupedKeys = new Set(GROUPS.flatMap(g => g.keys))
  const ungrouped = settingsList.filter(s => !groupedKeys.has(s.key))

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Runtime parameters for AI review, scraping, and content quality.
          Changes take effect immediately — no server restart required.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><Spinner /></div>
      )}
      {isError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Failed to load settings. Is the backend running?
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-5 max-w-3xl">
          {GROUPS.map(group => (
            <SettingGroup
              key={group.key}
              group={group}
              settingsMap={settingsMap}
            />
          ))}

          {/* Fallback group for any future settings not in GROUPS */}
          {ungrouped.length > 0 && (
            <SettingGroup
              group={{ key: 'other', label: 'Other', icon: '⚙️', keys: ungrouped.map(s => s.key), note: '' }}
              settingsMap={settingsMap}
            />
          )}
        </div>
      )}
    </div>
  )
}
