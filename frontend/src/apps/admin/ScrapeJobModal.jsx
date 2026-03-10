import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createJob } from '../../services/scrapeJobs'
import { getSites } from '../../services/sites'
import Modal from '../../components/Modal'

const EMPTY = { site_id: '', url: '', frequency_minutes: 60, category_rules: '' }

function TagsInput({ value, onChange }) {
  const tags = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : []

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag).join(', '))
  }

  function handleKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
      e.preventDefault()
      const newTag = e.target.value.trim().replace(/,/g, '')
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag].join(', '))
      }
      e.target.value = ''
    }
  }

  return (
    <div className="border border-gray-300 rounded-lg px-3 py-2 min-h-[42px] flex flex-wrap gap-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded px-2 py-0.5">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="text-indigo-400 hover:text-indigo-700 leading-none">×</button>
        </span>
      ))}
      <input
        type="text"
        placeholder={tags.length === 0 ? 'Type a keyword and press Enter or comma…' : ''}
        className="outline-none text-sm flex-1 min-w-[140px] bg-transparent"
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          if (e.target.value.trim()) {
            const newTag = e.target.value.trim()
            if (!tags.includes(newTag)) onChange([...tags, newTag].join(', '))
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}

export default function ScrapeJobModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: () => getSites(true) })
  const activeSites = sites.filter((s) => s.is_active)

  const mutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scrape-jobs'] }); onClose() },
    onError: (err) => {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') setErrors({ _general: detail })
      else if (Array.isArray(detail)) {
        const map = {}
        detail.forEach((d) => { const f = d.loc?.[d.loc.length - 1]; if (f) map[f] = d.msg })
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
    if (!form.site_id) next.site_id = 'Select a site'
    if (!form.url.trim()) next.url = 'Required'
    else if (!/^https?:\/\/.+/.test(form.url.trim())) next.url = 'Must start with http:// or https://'
    if (!form.frequency_minutes || form.frequency_minutes < 1) next.frequency_minutes = 'Must be at least 1 minute'
    if (Object.keys(next).length) { setErrors(next); return }
    mutation.mutate({
      site_id: Number(form.site_id),
      url: form.url.trim(),
      frequency_minutes: Number(form.frequency_minutes),
      category_rules: form.category_rules.trim() || null,
    })
  }

  return (
    <Modal title="New Scrape Job" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {errors._general && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errors._general}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
          <select className={`input-field ${errors.site_id ? 'border-red-400' : ''}`}
            value={form.site_id} onChange={(e) => set('site_id', e.target.value)}>
            <option value="">Select a site…</option>
            {activeSites.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.domain}</option>)}
          </select>
          {errors.site_id && <p className="mt-1 text-xs text-red-600">{errors.site_id}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL to Scrape</label>
          <input type="url" className={`input-field ${errors.url ? 'border-red-400' : ''}`}
            value={form.url} onChange={(e) => set('url', e.target.value)}
            placeholder="https://example.com/news" />
          {errors.url && <p className="mt-1 text-xs text-red-600">{errors.url}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frequency <span className="text-gray-400 font-normal">(minutes)</span>
          </label>
          <input type="number" min={1} max={10080} className={`input-field ${errors.frequency_minutes ? 'border-red-400' : ''}`}
            value={form.frequency_minutes} onChange={(e) => set('frequency_minutes', e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">
            {form.frequency_minutes >= 1440
              ? `Every ${Math.round(form.frequency_minutes / 1440)} day(s)`
              : form.frequency_minutes >= 60
              ? `Every ${Math.round(form.frequency_minutes / 60)} hour(s)`
              : `Every ${form.frequency_minutes} minute(s)`}
          </p>
          {errors.frequency_minutes && <p className="mt-1 text-xs text-red-600">{errors.frequency_minutes}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category Keywords <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <TagsInput value={form.category_rules} onChange={(v) => set('category_rules', v)} />
          <p className="mt-1 text-xs text-gray-400">Keywords used to tag scraped articles. Press Enter or comma to add.</p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Creating…' : 'Create Job'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
