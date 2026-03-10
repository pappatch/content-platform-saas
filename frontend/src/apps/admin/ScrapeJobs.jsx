import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getJobs, deleteJob, runJob } from '../../services/scrapeJobs'
import { getSites } from '../../services/sites'
import ScrapeJobModal from './ScrapeJobModal'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'

const STATUS_BADGE = {
  pending:  'bg-yellow-100 text-yellow-700',
  running:  'bg-blue-100  text-blue-700',
  done:     'bg-green-100 text-green-700',
  failed:   'bg-red-100   text-red-700',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function FrequencyLabel({ minutes }) {
  if (minutes >= 1440) return `Every ${Math.round(minutes / 1440)}d`
  if (minutes >= 60)   return `Every ${Math.round(minutes / 60)}h`
  return `Every ${minutes}m`
}

export default function ScrapeJobs() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [runningIds, setRunningIds] = useState(new Set())

  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ['scrape-jobs'],
    queryFn: () => getJobs(),
    refetchInterval: 10_000,
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s]))

  const remove = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scrape-jobs'] }); setConfirmId(null) },
  })

  async function handleRun(id) {
    setRunningIds((prev) => new Set(prev).add(id))
    try {
      await runJob(id)
      qc.invalidateQueries({ queryKey: ['scrape-jobs'] })
    } finally {
      setRunningIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Failed to load scrape jobs.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Scrape Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Job</button>
      </div>

      {jobs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm mb-4">No scrape jobs yet.</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>Create your first job</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Site</th>
                <th className="px-4 py-3 font-medium text-gray-600">Search Keywords</th>
                <th className="px-4 py-3 font-medium text-gray-600">Lang</th>
                <th className="px-4 py-3 font-medium text-gray-600">Frequency</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Last Run</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map((job) => {
                const site = siteMap[job.site_id]
                const isRunning = runningIds.has(job.id)
                const status = job.status || 'pending'
                return (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {site ? site.name : `Site #${job.site_id}`}
                      {site && <span className="block text-xs text-gray-400 font-normal">{site.domain}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[200px]">
                      {(job.keywords || []).map((k) => (
                        <span key={k} className="inline-block mr-1 mb-0.5 bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">
                          {k}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 uppercase">
                        {job.language || 'en'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <FrequencyLabel minutes={job.frequency_minutes} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(job.last_run)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => handleRun(job.id)}
                        disabled={isRunning || status === 'running'}
                        className="text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isRunning ? 'Running…' : 'Run'}
                      </button>
                      <button
                        onClick={() => setConfirmId(job.id)}
                        className="text-red-500 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ScrapeJobModal onClose={() => setShowModal(false)} />}

      {confirmId !== null && (
        <ConfirmDialog
          title="Delete scrape job?"
          message="This will permanently remove the job. Scraped articles won't be affected."
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}
