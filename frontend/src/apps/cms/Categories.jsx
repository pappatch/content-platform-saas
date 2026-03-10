import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCategories, deleteCategory } from '../../services/categories'
import { getSites } from '../../services/sites'
import CategoryModal from './CategoryModal'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'

export default function Categories() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [siteFilter, setSiteFilter] = useState('')
  const [modalCategory, setModalCategory] = useState(undefined) // undefined=closed, null=new, obj=edit
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const { data: categories = [], isLoading, isError } = useQuery({
    queryKey: ['cms-categories'],
    queryFn: () => getCategories(),
  })

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))

  const filtered = siteFilter
    ? categories.filter((c) => String(c.site_id) === String(siteFilter))
    : categories

  const deleteMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms-categories'] })
      setConfirmDeleteId(null)
    },
  })

  if (isLoading) return <Spinner />
  if (isError) return <p className="text-sm text-red-600">Failed to load categories.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <button className="btn-primary" onClick={() => setModalCategory(null)}>+ New Category</button>
      </div>

      {/* Site filter */}
      <div className="flex gap-2 mb-4">
        <select
          className="input-field w-auto text-sm"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-sm mb-4">No categories yet.</p>
          <button className="btn-primary" onClick={() => setModalCategory(null)}>
            Create your first category
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="px-4 py-3 font-medium text-gray-600">Site</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3 text-gray-500">{siteMap[c.site_id] ?? `#${c.site_id}`}</td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                      onClick={() => setModalCategory(c)}
                    >
                      Edit
                    </button>
                    {isAdmin && (
                      <button
                        className="text-red-500 hover:text-red-700 font-medium"
                        onClick={() => setConfirmDeleteId(c.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalCategory !== undefined && (
        <CategoryModal
          category={modalCategory}
          onClose={() => setModalCategory(undefined)}
        />
      )}

      {confirmDeleteId !== null && (
        <ConfirmDialog
          title="Delete category?"
          message="Articles in this category will become uncategorized."
          confirmLabel="Delete"
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
