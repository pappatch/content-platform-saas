import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSite, updateSite } from '../../services/sites'

const TEMPLATES = ['template-a', 'template-b', 'template-c', 'template-d', 'template-e']
const LANGUAGES = [
  { value: 'en', label: 'English (LTR)' },
  { value: 'fr', label: 'French (LTR)' },
  { value: 'he', label: 'Hebrew (RTL)' },
  { value: 'ar', label: 'Arabic (RTL)' },
]

const EMPTY = { name: '', domain: '', template_id: 'template-a', language: 'en' }

function fieldError(errors, field) {
  return errors?.[field]
}

export default function SiteModal({ site, onClose }) {
  const isEdit = Boolean(site)
  const qc = useQueryClient()

  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (site) {
      setForm({
        name: site.name,
        domain: site.domain,
        template_id: site.template_id,
        language: site.language,
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [site])

  const mutation = useMutation({
    mutationFn: (data) => (isEdit ? updateSite(site.id, data) : createSite(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      onClose()
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') {
        setErrors({ _general: detail })
      } else if (Array.isArray(detail)) {
        const map = {}
        detail.forEach((d) => {
          const field = d.loc?.[d.loc.length - 1]
          if (field) map[field] = d.msg
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
    if (!form.name.trim()) next.name = 'Required'
    if (!form.domain.trim()) next.domain = 'Required'
    if (Object.keys(next).length) { setErrors(next); return }
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Site' : 'New Site'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {errors._general && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {errors._general}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              className={`input-field ${errors.name ? 'border-red-400' : ''}`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="My News Site"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain
            </label>
            <input
              className={`input-field ${errors.domain ? 'border-red-400' : ''}`}
              value={form.domain}
              onChange={(e) => set('domain', e.target.value)}
              placeholder="example.com"
            />
            {errors.domain && <p className="mt-1 text-xs text-red-600">{errors.domain}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                className="input-field"
                value={form.language}
                onChange={(e) => set('language', e.target.value)}
              >
                {LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template
              </label>
              <select
                className="input-field"
                value={form.template_id}
                onChange={(e) => set('template_id', e.target.value)}
              >
                {TEMPLATES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
