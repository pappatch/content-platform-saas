import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createCategory, updateCategory } from '../../services/categories'
import { getSites } from '../../services/sites'
import Modal from '../../components/Modal'

export default function CategoryModal({ category = null, onClose }) {
  const qc = useQueryClient()
  const isEdit = category != null

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const [form, setForm] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    site_id: category?.site_id ?? '',
  })
  const [errors, setErrors] = useState({})

  // Auto-generate slug from name when creating
  useEffect(() => {
    if (!isEdit && form.name) {
      setForm((f) => ({
        ...f,
        slug: form.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, ''),
      }))
    }
  }, [form.name, isEdit])

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit ? updateCategory(category.id, data) : createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms-categories'] })
      onClose()
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') setErrors({ _general: detail })
      else if (Array.isArray(detail)) {
        const map = {}
        detail.forEach((d) => {
          const f = d.loc?.[d.loc.length - 1]
          if (f) map[f] = d.msg
        })
        setErrors(map)
      }
    },
  })

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined, _general: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (!form.slug.trim()) next.slug = 'Slug is required'
    if (!isEdit && !form.site_id) next.site_id = 'Select a site'
    if (Object.keys(next).length) { setErrors(next); return }
    const payload = { name: form.name.trim(), slug: form.slug.trim() }
    if (!isEdit) payload.site_id = Number(form.site_id)
    mutation.mutate(payload)
  }

  return (
    <Modal title={isEdit ? 'Edit Category' : 'New Category'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {errors._general && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errors._general}
          </div>
        )}

        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
            <select
              className={`input-field ${errors.site_id ? 'border-red-400' : ''}`}
              value={form.site_id}
              onChange={(e) => set('site_id', e.target.value)}
            >
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {errors.site_id && <p className="mt-1 text-xs text-red-600">{errors.site_id}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            className={`input-field ${errors.name ? 'border-red-400' : ''}`}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Technology"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input
            type="text"
            className={`input-field ${errors.slug ? 'border-red-400' : ''}`}
            value={form.slug}
            onChange={(e) => set('slug', e.target.value)}
            placeholder="e.g. technology"
          />
          {errors.slug && <p className="mt-1 text-xs text-red-600">{errors.slug}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
