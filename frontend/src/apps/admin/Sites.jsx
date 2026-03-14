import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSites, getSiteStats, deleteSite, auditImages, regenerateSiteLogo } from '../../services/sites'
import { getArticles, updateArticle } from '../../services/articles'
import { getJobs, runJob } from '../../services/scrapeJobs'
import SiteModal from './SiteModal'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'

const LANG_LABEL = { en: 'EN', fr: 'FR', he: 'HE', ar: 'AR' }
const TEMPLATE_BADGE = {
  'template-a': { label: 'Newspaper', cls: 'bg-gray-100 text-gray-700' },
  'template-b': { label: 'Magazine',  cls: 'bg-purple-100 text-purple-700' },
  'template-c': { label: 'Blog',      cls: 'bg-blue-100 text-blue-700' },
  'template-d': { label: 'Cards',     cls: 'bg-indigo-100 text-indigo-700' },
  'template-e': { label: 'Sidebar',   cls: 'bg-cyan-100 text-cyan-700' },
}
const JOB_STATUS_BADGE = {
  pending: 'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700',
  done:    'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function ColorSwatch({ hex }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#e5e7eb'
  return <span className="inline-block w-4 h-4 rounded-sm border border-black/10" style={{ backgroundColor: safe }} />
}

function ArticleCountBadge({ published, pending }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      {published > 0 && (
        <span className="rounded px-1.5 py-0.5 bg-green-100 text-green-700 font-medium">{published}</span>
      )}
      {pending > 0 && (
        <span className="rounded px-1.5 py-0.5 bg-yellow-100 text-yellow-700 font-medium">{pending} pending</span>
      )}
      {published === 0 && pending === 0 && (
        <span className="text-gray-300">—</span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pinned Articles Modal
// ---------------------------------------------------------------------------

function PinnedModal({ site, onClose }) {
  const qc = useQueryClient()

  const { data: allArticles = [], isLoading } = useQuery({
    queryKey: ['pinned-articles', site.id],
    queryFn: () => getArticles({ site_id: site.id, status: 'published' }),
    refetchOnWindowFocus: false,
  })

  const now = new Date()
  const pinned = allArticles.filter((a) =>
    a.is_pinned || (a.pinned_until && new Date(a.pinned_until) > now)
  )

  const unpinMut = useMutation({
    mutationFn: (id) => updateArticle(id, { is_pinned: false, pinned_until: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pinned-articles', site.id] })
      qc.invalidateQueries({ queryKey: ['site-stats'] })
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Pinned Articles — {site.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <Spinner />
          ) : pinned.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No pinned articles.</p>
          ) : (
            <ul className="space-y-3">
              {pinned.map((a) => {
                const hasTimed = a.pinned_until && new Date(a.pinned_until) > now
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.is_pinned && !hasTimed && (
                          <span className="text-xs text-indigo-500 font-medium">📌 Editorial pin</span>
                        )}
                        {hasTimed && (
                          <span className="text-xs text-purple-600 font-medium">
                            ⏱ Until {new Date(a.pinned_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => unpinMut.mutate(a.id)}
                      disabled={unpinMut.isPending}
                      className="text-xs text-red-500 hover:text-red-700 font-medium whitespace-nowrap disabled:opacity-40"
                    >
                      Unpin
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Image Audit Result Modal
// ---------------------------------------------------------------------------

function AuditModal({ report, onClose }) {
  if (!report) return null
  const { total_inspected, missing, noise, broken, fixed, fix_failed, details = [] } = report
  const issues = details.filter((d) => d.issue)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Image Audit Results</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Inspected', value: total_inspected, cls: 'bg-gray-50 text-gray-700' },
              { label: 'Missing',   value: missing,          cls: 'bg-amber-50 text-amber-700' },
              { label: 'Noise/Bad', value: noise + broken,   cls: 'bg-red-50 text-red-700' },
              { label: 'Fixed',     value: fixed,            cls: 'bg-green-50 text-green-700' },
              { label: 'Fix failed',value: fix_failed,       cls: 'bg-orange-50 text-orange-700' },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`rounded-lg px-4 py-2 text-center ${cls}`}>
                <div className="text-xl font-bold">{value ?? 0}</div>
                <div className="text-xs font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Detail list */}
          {issues.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No image issues found — all articles look good.</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((d) => (
                <li key={d.article_id} className="text-xs border border-gray-100 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">#{d.article_id} — {d.title}</p>
                      <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        d.issue === 'missing' ? 'bg-amber-100 text-amber-700' :
                        d.issue === 'broken'  ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>{d.issue}</span>
                    </div>
                    {d.new_url && (
                      <img src={d.new_url} alt="" className="w-16 h-10 object-cover rounded shrink-0" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Sites() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)       // null | 'create' | site object
  const [confirmId, setConfirmId] = useState(null)
  const [pinnedSite, setPinnedSite] = useState(null)
  const [runningIds, setRunningIds] = useState(new Set())
  const [logoRegenerating, setLogoRegenerating] = useState(new Set())
  const [auditReport, setAuditReport] = useState(null)
  const [auditRunning, setAuditRunning] = useState(false)

  async function handleImageAudit() {
    if (auditRunning) return
    setAuditRunning(true)
    try {
      const report = await auditImages(true, 200)
      setAuditReport(report)
    } catch (e) {
      console.error('Image audit failed:', e)
    } finally {
      setAuditRunning(false)
    }
  }

  const { data: sites = [], isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const { data: stats = [] } = useQuery({
    queryKey: ['site-stats'],
    queryFn: () => getSiteStats(),
    refetchInterval: 15_000,
  })

  const statsMap = Object.fromEntries(stats.map((s) => [s.site_id, s]))

  const deactivate = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      qc.invalidateQueries({ queryKey: ['site-stats'] })
      setConfirmId(null)
    },
  })

  async function handleRegenerateLogo(siteId) {
    if (logoRegenerating.has(siteId)) return
    setLogoRegenerating((prev) => new Set(prev).add(siteId))
    try {
      await regenerateSiteLogo(siteId)
      qc.invalidateQueries({ queryKey: ['sites'] })
    } catch (e) {
      console.error('Logo regeneration failed:', e)
    } finally {
      setLogoRegenerating((prev) => { const s = new Set(prev); s.delete(siteId); return s })
    }
  }

  async function handleRunNow(jobId) {
    if (!jobId || runningIds.has(jobId)) return
    setRunningIds((prev) => new Set(prev).add(jobId))
    try {
      await runJob(jobId)
      qc.invalidateQueries({ queryKey: ['site-stats'] })
    } catch (e) {
      console.error('Run job failed:', e)
    } finally {
      setRunningIds((prev) => { const s = new Set(prev); s.delete(jobId); return s })
    }
  }

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Failed to load sites. Is the backend running?</p>

  const active = sites.filter((s) => s.is_active)
  const inactive = sites.filter((s) => !s.is_active)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} active{inactive.length > 0 ? `, ${inactive.length} inactive` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImageAudit}
            disabled={auditRunning}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Scan all articles for missing or broken images and fix them via Unsplash"
          >
            {auditRunning ? 'Auditing…' : '🖼 Image Audit'}
          </button>
          <button className="btn-primary" onClick={() => setModal('create')}>+ New Site</button>
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm mb-4">No sites yet.</p>
          <button className="btn-primary" onClick={() => setModal('create')}>Create your first site</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 font-medium text-gray-600">Template</th>
                <th className="px-4 py-3 font-medium text-gray-600">Lang</th>
                <th className="px-4 py-3 font-medium text-gray-600">Colors</th>
                <th className="px-4 py-3 font-medium text-gray-600">Articles</th>
                <th className="px-4 py-3 font-medium text-gray-600">Pins</th>
                <th className="px-4 py-3 font-medium text-gray-600">Last Scrape</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sites.map((site) => {
                const st = statsMap[site.id] || {}
                const isRunning = st.job_id && runningIds.has(st.job_id)
                const tmpl = TEMPLATE_BADGE[site.template_id] || { label: site.template_id, cls: 'bg-gray-100 text-gray-600' }
                const previewUrl = `http://localhost:${5173 + site.id}`

                return (
                  <tr key={site.id} className={`transition-colors ${site.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/50 opacity-60'}`}>
                    {/* Name + domain */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {site.config?.logo_url && (
                          <img src={site.config.logo_url} alt="" style={{ width: 'auto', maxWidth: '200px', height: '50px', objectFit: 'contain' }} className="shrink-0" />
                        )}
                        <div className="font-medium text-gray-900">{site.name}</div>
                      </div>
                      <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-indigo-600 hover:underline">
                        {site.domain}
                      </a>
                      {site.config?.tagline && (
                        <p className="text-xs text-gray-400 italic mt-0.5 truncate max-w-[180px]">{site.config.tagline}</p>
                      )}
                    </td>

                    {/* Template badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tmpl.cls}`}>
                        {tmpl.label}
                      </span>
                    </td>

                    {/* Language */}
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                        {LANG_LABEL[site.language] ?? site.language}
                      </span>
                      <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${site.text_direction === 'rtl' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {site.text_direction?.toUpperCase()}
                      </span>
                    </td>

                    {/* Colors */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {['primary_color', 'secondary_color', 'bg_color', 'text_color'].map((k) => (
                          <ColorSwatch key={k} hex={site.config?.[k]} />
                        ))}
                      </div>
                    </td>

                    {/* Article counts */}
                    <td className="px-4 py-3">
                      <ArticleCountBadge published={st.published ?? 0} pending={st.pending ?? 0} />
                    </td>

                    {/* Active pins */}
                    <td className="px-4 py-3">
                      {(st.active_pin_count ?? 0) > 0 ? (
                        <button
                          onClick={() => setPinnedSite(site)}
                          className="text-xs rounded px-1.5 py-0.5 bg-indigo-100 text-indigo-700 font-medium hover:bg-indigo-200 transition-colors"
                        >
                          📌 {st.active_pin_count}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Last scrape + job status */}
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500">{formatDate(st.last_run)}</div>
                      {st.job_status && (
                        <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${JOB_STATUS_BADGE[st.job_status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {st.job_status}
                        </span>
                      )}
                      {st.last_error && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[150px] truncate" title={st.last_error}>
                          ⚠ {st.last_error}
                        </p>
                      )}
                    </td>

                    {/* Active status */}
                    <td className="px-4 py-3">
                      {site.is_active
                        ? <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Active</span>
                        : <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-500">Inactive</span>
                      }
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {/* Preview in renderer */}
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-gray-400 hover:text-gray-700 font-medium text-xs"
                        title={`Open site renderer (${previewUrl})`}
                      >
                        Preview ↗
                      </a>
                      {/* Run Now */}
                      {st.job_id && (
                        <button
                          onClick={() => handleRunNow(st.job_id)}
                          disabled={isRunning || st.job_status === 'running'}
                          className="text-emerald-600 hover:text-emerald-800 font-medium text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRunning ? 'Running…' : 'Run'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRegenerateLogo(site.id)}
                        disabled={logoRegenerating.has(site.id)}
                        className="text-violet-600 hover:text-violet-800 font-medium text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Regenerate SVG logo"
                      >
                        {logoRegenerating.has(site.id) ? 'Generating…' : 'Logo'}
                      </button>
                      <button onClick={() => setModal(site)} className="text-indigo-600 hover:text-indigo-800 font-medium text-xs">
                        Edit
                      </button>
                      {site.is_active && (
                        <button onClick={() => setConfirmId(site.id)} className="text-red-500 hover:text-red-700 font-medium text-xs">
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <SiteModal site={modal === 'create' ? null : modal} onClose={() => setModal(null)} />
      )}

      {confirmId !== null && (
        <ConfirmDialog
          title="Deactivate site?"
          message="The site will be hidden from the public. You can reactivate it via the Edit form."
          confirmLabel="Deactivate"
          loading={deactivate.isPending}
          onConfirm={() => deactivate.mutate(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {pinnedSite && (
        <PinnedModal site={pinnedSite} onClose={() => setPinnedSite(null)} />
      )}

      {auditReport && (
        <AuditModal report={auditReport} onClose={() => setAuditReport(null)} />
      )}
    </div>
  )
}
