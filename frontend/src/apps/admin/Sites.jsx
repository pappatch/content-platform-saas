import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSites, deleteSite } from '../../services/sites'
import SiteModal from './SiteModal'
import Spinner from '../../components/Spinner'

const DIRECTION_BADGE = {
  rtl: 'bg-purple-100 text-purple-700',
  ltr: 'bg-blue-100 text-blue-700',
}

const LANG_LABEL = { en: 'EN', fr: 'FR', he: 'HE', ar: 'AR' }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function Sites() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // null | 'create' | site object
  const [confirmId, setConfirmId] = useState(null)

  const { data: sites = [], isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: getSites,
  })

  const deactivate = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      setConfirmId(null)
    },
  })

  if (isLoading) return <Spinner />
  if (isError) return (
    <div className="text-sm text-red-600">Failed to load sites. Check that the backend is running.</div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sites.length} active site{sites.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('create')}>
          + New Site
        </button>
      </div>

      {/* Table */}
      {sites.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm">No sites yet.</p>
          <button className="btn-primary mt-4" onClick={() => setModal('create')}>
            Create your first site
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 font-medium text-gray-600">Domain</th>
                <th className="px-4 py-3 font-medium text-gray-600">Lang</th>
                <th className="px-4 py-3 font-medium text-gray-600">Direction</th>
                <th className="px-4 py-3 font-medium text-gray-600">Template</th>
                <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sites.map((site) => (
                <tr key={site.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{site.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {site.domain}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                      {LANG_LABEL[site.language] ?? site.language}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium uppercase ${DIRECTION_BADGE[site.text_direction] ?? ''}`}>
                      {site.text_direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{site.template_id}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(site.created_at)}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => setModal(site)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmId(site.id)}
                      className="text-red-500 hover:text-red-700 font-medium"
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal !== null && (
        <SiteModal
          site={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}

      {/* Deactivate confirmation */}
      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Deactivate site?</h3>
            <p className="text-sm text-gray-500 mb-6">
              The site will be hidden from all lists. This can be reversed from the database.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setConfirmId(null)}>
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                disabled={deactivate.isPending}
                onClick={() => deactivate.mutate(confirmId)}
              >
                {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
