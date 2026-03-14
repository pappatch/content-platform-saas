import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createJob, updateJob } from '../../services/scrapeJobs'
import { getSites } from '../../services/sites'
import Modal from '../../components/Modal'

const LANGUAGES = [
  { value: 'en', label: 'English', dir: 'LTR' },
  { value: 'fr', label: 'French',  dir: 'LTR' },
  { value: 'he', label: 'Hebrew',  dir: 'RTL' },
  { value: 'ar', label: 'Arabic',  dir: 'RTL' },
]

const EMPTY = { site_id: '', keywords: [], language: 'en', frequency_minutes: 60, category_rules: '' }

function jobToForm(job) {
  return {
    site_id: String(job.site_id),
    keywords: job.keywords || [],
    language: job.language || 'en',
    frequency_minutes: job.frequency_minutes ?? 60,
    category_rules: job.category_rules || '',
  }
}

// ---------------------------------------------------------------------------
// TagsInput — shared chip-based keyword input
// ---------------------------------------------------------------------------
function TagsInput({ value: tags, onChange, placeholder }) {
  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
      e.preventDefault()
      const newTag = e.target.value.trim().replace(/,/g, '')
      if (newTag && !tags.includes(newTag)) onChange([...tags, newTag])
      e.target.value = ''
    }
  }

  function handleBlur(e) {
    if (e.target.value.trim()) {
      const newTag = e.target.value.trim()
      if (!tags.includes(newTag)) onChange([...tags, newTag])
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
        placeholder={tags.length === 0 ? (placeholder || 'Type and press Enter or comma…') : ''}
        className="outline-none text-sm flex-1 min-w-[140px] bg-transparent"
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export default function ScrapeJobModal({ job = null, onClose }) {
  const isEdit = Boolean(job)
  const qc = useQueryClient()
  const [form, setForm] = useState(isEdit ? jobToForm(job) : EMPTY)
  const [errors, setErrors] = useState({})

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: () => getSites(true) })
  const activeSites = sites.filter((s) => s.is_active)

  const mutation = useMutation({
    mutationFn: isEdit
      ? (data) => updateJob(job.id, data)
      : createJob,
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
    if (!isEdit && !form.site_id) next.site_id = 'Select a site'
    if (form.keywords.length === 0) next.keywords = 'Add at least one search keyword'
    if (!form.frequency_minutes || form.frequency_minutes < 1) next.frequency_minutes = 'Must be at least 1 minute'
    if (Object.keys(next).length) { setErrors(next); return }

    const payload = {
      keywords: form.keywords,
      language: form.language,
      frequency_minutes: Number(form.frequency_minutes),
      category_rules: form.category_rules.trim() || null,
    }
    if (!isEdit) payload.site_id = Number(form.site_id)
    mutation.mutate(payload)
  }

  return (
    <Modal title={isEdit ? 'Edit Scrape Job' : 'New Scrape Job'} onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        {errors._general && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errors._general}
          </div>
        )}

        {/* Site — shown only when creating; locked on edit */}
        {isEdit ? (
          <div className="rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-500">
            Site: <span className="font-medium text-gray-700">
              {sites.find((s) => s.id === job.site_id)?.name ?? `#${job.site_id}`}
            </span>
            <span className="ml-1 text-gray-400">(cannot change)</span>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
            <select
              className={`input-field ${errors.site_id ? 'border-red-400' : ''}`}
              value={form.site_id}
              onChange={(e) => set('site_id', e.target.value)}
            >
              <option value="">Select a site…</option>
              {activeSites.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.domain}</option>
              ))}
            </select>
            {errors.site_id && <p className="mt-1 text-xs text-red-600">{errors.site_id}</p>}
          </div>
        )}

        {/* Search Keywords */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Keywords
          </label>
          <TagsInput
            value={form.keywords}
            onChange={(v) => set('keywords', v)}
            placeholder="e.g. artificial intelligence, climate…"
          />
          <p className="mt-1 text-xs text-gray-400">
            Used to search Tavily + Google. Press Enter or comma to add a term.
          </p>
          {errors.keywords && <p className="mt-1 text-xs text-red-600">{errors.keywords}</p>}
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Language</label>
          <div className="grid grid-cols-4 gap-2">
            {LANGUAGES.map(({ value, label, dir }) => (
              <button
                key={value}
                type="button"
                onClick={() => set('language', value)}
                className={`py-2 px-3 rounded-lg border text-sm text-center transition-colors ${
                  form.language === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold">{label}</div>
                <div className="text-xs opacity-60">{dir}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frequency <span className="text-gray-400 font-normal">(minutes)</span>
          </label>
          <input
            type="number"
            min={1}
            max={10080}
            className={`input-field ${errors.frequency_minutes ? 'border-red-400' : ''}`}
            value={form.frequency_minutes}
            onChange={(e) => set('frequency_minutes', e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">
            {form.frequency_minutes >= 1440
              ? `Every ${Math.round(form.frequency_minutes / 1440)} day(s)`
              : form.frequency_minutes >= 60
              ? `Every ${Math.round(form.frequency_minutes / 60)} hour(s)`
              : `Every ${form.frequency_minutes} minute(s)`}
          </p>
          {errors.frequency_minutes && <p className="mt-1 text-xs text-red-600">{errors.frequency_minutes}</p>}
        </div>

        {/* Category Rules (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category Tags <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <TagsInput
            value={form.category_rules ? form.category_rules.split(',').map((t) => t.trim()).filter(Boolean) : []}
            onChange={(v) => set('category_rules', v.join(', '))}
            placeholder="Tag scraped articles…"
          />
          <p className="mt-1 text-xs text-gray-400">
            Keywords used to auto-tag articles after scraping (separate from search terms).
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Job')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
