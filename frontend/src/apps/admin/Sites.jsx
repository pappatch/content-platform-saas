import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSites, deleteSite } from '../../services/sites'
import SiteModal from './SiteModal'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'

const LANG_LABEL = { en: 'EN', fr: 'FR', he: 'HE', ar: 'AR' }
const DIR_BADGE = { rtl: 'bg-purple-100 text-purple-700', ltr: 'bg-blue-100 text-blue-700' }
const TEMPLATE_NAME = {
  'template-a': 'Newspaper', 'template-b': 'Magazine', 'template-c': 'Blog',
  'template-d': 'Cards', 'template-e': 'Sidebar',
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ColorSwatch({ hex }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#e5e7eb'
  return <span className="inline-block w-4 h-4 rounded-sm border border-black/10" style={{ backgroundColor: safe }} />
}

export default function Sites() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const { data: sites = [], isLoading, isError } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true), // admin sees all including inactive
  })

  const deactivate = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); setConfirmId(null) },
  })

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
        <button className="btn-primary" onClick={() => setModal('create')}>+ New Site</button>
      </div>

      {sites.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm mb-4">No sites yet.</p>
          <button className="btn-primary" onClick={() => setModal('create')}>Create your first site</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 font-medium text-gray-600">Domain</th>
                <th className="px-4 py-3 font-medium text-gray-600">Template</th>
                <th className="px-4 py-3 font-medium text-gray-600">Lang</th>
                <th className="px-4 py-3 font-medium text-gray-600">Colors</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sites.map((site) => (
                <tr key={site.id} className={`transition-colors ${site.is_active ? 'hover:bg-gray-50' : 'bg-gray-50/50 opacity-70'}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{site.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer"
                      className="hover:text-indigo-600 hover:underline">{site.domain}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {TEMPLATE_NAME[site.template_id] || site.template_id}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                        {LANG_LABEL[site.language] ?? site.language}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${DIR_BADGE[site.text_direction] ?? ''}`}>
                        {site.text_direction}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {['primary_color', 'secondary_color', 'bg_color', 'text_color'].map((k) => (
                        <ColorSwatch key={k} hex={site.config?.[k]} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {site.is_active
                      ? <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Active</span>
                      : <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-500">Inactive</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(site.created_at)}</td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => setModal(site)} className="text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                    {site.is_active && (
                      <button onClick={() => setConfirmId(site.id)} className="text-red-500 hover:text-red-700 font-medium">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
    </div>
  )
}
