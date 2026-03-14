import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSite, updateSite, previewSiteConfig, enrichSite, getSiteDefaultImages } from '../../services/sites'
import Modal from '../../components/Modal'

const LANGUAGES = [
  { value: 'en', label: 'English', dir: 'LTR' },
  { value: 'fr', label: 'French',  dir: 'LTR' },
  { value: 'he', label: 'Hebrew',  dir: 'RTL' },
  { value: 'ar', label: 'Arabic',  dir: 'RTL' },
]

const TEMPLATES = [
  { id: 'template-a', name: 'Newspaper', icon: '📰', desc: 'Dense columns, dark masthead, full-width featured article' },
  { id: 'template-b', name: 'Magazine',  icon: '🖼️', desc: 'Full-bleed hero image with overlay, spotlight rows' },
  { id: 'template-c', name: 'Minimal Blog', icon: '✍️', desc: 'Single column, large typography, generous whitespace' },
  { id: 'template-d', name: 'Card Modern',  icon: '🃏', desc: 'Uniform cards, gradient header, hover scale effects' },
  { id: 'template-e', name: 'Sidebar Portal', icon: '📑', desc: 'Main content + sidebar with categories and pinned articles' },
]

const DEFAULT_CONFIG = {
  primary_color:   '#4f46e5',
  secondary_color: '#6366f1',
  bg_color:        '#ffffff',
  text_color:      '#111827',
  tagline:         '',
  about:           '',
  default_category_names: [],
}

function buildEmpty() {
  return { name: '', domain: '', template_id: 'template-a', language: 'en', is_active: true, config: { ...DEFAULT_CONFIG } }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ColorPicker({ label, value, onChange }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 rounded-lg cursor-pointer p-0.5 border border-gray-200 bg-white shadow-sm shrink-0"
        />
        <input
          type="text"
          value={value}
          maxLength={7}
          onChange={(e) => onChange(e.target.value)}
          className="input-field font-mono text-xs"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

function FieldError({ msg }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null
}

/**
 * Simple tag / chip input for default_category_names.
 * Press Enter or comma to add a tag. Click × to remove.
 */
function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('')

  function add(raw) {
    const val = raw.trim().replace(/,$/, '').trim()
    if (!val || tags.includes(val) || tags.length >= 8) return
    onChange([...tags, val])
    setInput('')
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-gray-200 bg-white min-h-[40px] cursor-text focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="opacity-60 hover:opacity-100 leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => input && add(input)}
        placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent py-0.5"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

/** Returns true when tagline, about, or default_category_names are missing. */
function hasMissingFields(site) {
  if (!site) return false
  const cfg = site.config || {}
  return !cfg.tagline || !cfg.about || !(cfg.default_category_names?.length)
}

export default function SiteModal({ site, onClose }) {
  const isEdit = Boolean(site)
  const qc = useQueryClient()
  const [form, setForm] = useState(buildEmpty)
  const [errors, setErrors] = useState({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [showEnrichBanner, setShowEnrichBanner] = useState(false)
  const [enrichLoading, setEnrichLoading] = useState(false)
  const [defaultImages, setDefaultImages] = useState([])
  const [imagesLoading, setImagesLoading] = useState(false)

  useEffect(() => {
    if (site) {
      setForm({
        name:        site.name,
        domain:      site.domain,
        template_id: site.template_id,
        language:    site.language,
        is_active:   site.is_active,
        config:      { ...DEFAULT_CONFIG, ...(site.config || {}) },
      })
      setShowEnrichBanner(hasMissingFields(site))
      setDefaultImages(site.config?.default_images || [])
    } else {
      setForm(buildEmpty())
      setShowEnrichBanner(false)
      setDefaultImages([])
    }
    setErrors({})
    setAiError(null)
  }, [site])

  const mutation = useMutation({
    mutationFn: (data) => (isEdit ? updateSite(site.id, data) : createSite(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      qc.invalidateQueries({ queryKey: ['site-stats'] })
      onClose()
    },
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
  function setConfig(key, value) {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }))
  }

  // --- "Generate with AI" ---
  async function handleGenerateAI() {
    if (!form.name.trim()) {
      setErrors((e) => ({ ...e, name: 'Enter a site name first' }))
      return
    }
    setAiLoading(true)
    setAiError(null)
    try {
      const preview = await previewSiteConfig(
        form.name,
        form.language,
        form.config.default_category_names || [],
      )
      setForm((f) => ({
        ...f,
        template_id: preview.template_id || f.template_id,
        config: {
          ...f.config,
          primary_color:          preview.config?.primary_color   || f.config.primary_color,
          secondary_color:        preview.config?.secondary_color || f.config.secondary_color,
          tagline:                preview.config?.tagline         || f.config.tagline,
          about:                  preview.config?.about           || f.config.about,
          default_category_names: preview.config?.default_category_names?.length
            ? preview.config.default_category_names
            : f.config.default_category_names,
        },
      }))
    } catch (err) {
      const msg = err.response?.data?.detail || 'AI generation failed. Check your ANTHROPIC_API_KEY.'
      setAiError(msg)
    } finally {
      setAiLoading(false)
    }
  }

  // --- "Yes, fill with AI" banner action ---
  async function handleEnrich() {
    if (!site) return
    setEnrichLoading(true)
    try {
      const updated = await enrichSite(site.id)
      setForm((f) => ({
        ...f,
        config: { ...f.config, ...(updated.config || {}) },
      }))
      setDefaultImages(updated.config?.default_images || defaultImages)
      setShowEnrichBanner(false)
      qc.invalidateQueries({ queryKey: ['sites'] })
      qc.invalidateQueries({ queryKey: ['site-stats'] })
    } catch (err) {
      const msg = err.response?.data?.detail || 'AI enrichment failed.'
      setAiError(msg)
    } finally {
      setEnrichLoading(false)
    }
  }

  // --- Fetch / refresh default images from Unsplash ---
  async function handleFetchDefaultImages() {
    if (!site) return
    setImagesLoading(true)
    try {
      const result = await getSiteDefaultImages(site.id)
      setDefaultImages(result.images || [])
      setForm((f) => ({
        ...f,
        config: { ...f.config, default_images: result.images },
      }))
    } catch {
      // silently fail — images are optional
    } finally {
      setImagesLoading(false)
    }
  }

  // --- Replace a single image slot ---
  async function handleReplaceImage(slotIndex) {
    if (!site) return
    setImagesLoading(true)
    try {
      // Fetch a fresh batch and pick the slot (server returns random set each time)
      const result = await getSiteDefaultImages(site.id)
      const freshImages = result.images || []
      if (freshImages[slotIndex]) {
        const next = [...defaultImages]
        next[slotIndex] = freshImages[slotIndex]
        setDefaultImages(next)
        setForm((f) => ({
          ...f,
          config: { ...f.config, default_images: next },
        }))
      }
    } catch {
      // silently fail
    } finally {
      setImagesLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Required'
    if (!form.domain.trim()) next.domain = 'Required'
    if (Object.keys(next).length) { setErrors(next); return }
    const payload = {
      name:        form.name.trim(),
      domain:      form.domain.trim(),
      template_id: form.template_id,
      language:    form.language,
      config:      form.config,
      ...(isEdit ? { is_active: form.is_active } : {}),
    }
    mutation.mutate(payload)
  }

  return (
    <Modal title={isEdit ? `Edit — ${site.name}` : 'New Site'} onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
        {errors._general && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errors._general}
          </div>
        )}

        {/* Missing-fields warning banner (edit mode only) */}
        {isEdit && showEnrichBanner && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-800">Some fields are missing</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Tagline, About, or Default Categories are empty. Would you like AI to fill them automatically?
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleEnrich}
                disabled={enrichLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {enrichLoading ? 'Filling…' : 'Yes, fill with AI'}
              </button>
              <button
                type="button"
                onClick={() => setShowEnrichBanner(false)}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* Basic */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basic</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
              <input className={`input-field ${errors.name ? 'border-red-400' : ''}`} value={form.name}
                onChange={(e) => set('name', e.target.value)} placeholder="My News Site" />
              <FieldError msg={errors.name} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <input className={`input-field ${errors.domain ? 'border-red-400' : ''}`} value={form.domain}
                onChange={(e) => set('domain', e.target.value)} placeholder="example.com" />
              <FieldError msg={errors.domain} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <div className="grid grid-cols-4 gap-2">
                {LANGUAGES.map(({ value, label, dir }) => (
                  <button key={value} type="button" onClick={() => set('language', value)}
                    className={`py-2 px-3 rounded-lg border text-sm text-center transition-colors ${
                      form.language === value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <div className="font-semibold">{label}</div>
                    <div className="text-xs opacity-60">{dir}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Content — tagline, about, default categories */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Content</h3>
            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {aiLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                '✦ Generate with AI'
              )}
            </button>
          </div>

          {aiError && (
            <p className="mb-3 text-xs text-red-600 bg-red-50 rounded px-3 py-2">{aiError}</p>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tagline <span className="text-gray-400 font-normal">(short, shown under site name)</span>
              </label>
              <input
                className="input-field"
                value={form.config.tagline || ''}
                onChange={(e) => setConfig('tagline', e.target.value)}
                placeholder="Your daily source for bonsai inspiration"
                maxLength={80}
              />
              <p className="mt-0.5 text-xs text-gray-400 text-right">{(form.config.tagline || '').length}/80</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                About <span className="text-gray-400 font-normal">(2–3 sentences for footer)</span>
              </label>
              <textarea
                className="input-field resize-none"
                rows={3}
                value={form.config.about || ''}
                onChange={(e) => setConfig('about', e.target.value)}
                placeholder="Describe what this site covers and who it's for…"
                maxLength={300}
              />
              <p className="mt-0.5 text-xs text-gray-400 text-right">{(form.config.about || '').length}/300</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Categories <span className="text-gray-400 font-normal">(created on save, up to 8)</span>
              </label>
              <TagInput
                tags={form.config.default_category_names || []}
                onChange={(tags) => setConfig('default_category_names', tags)}
              />
              <p className="mt-1 text-xs text-gray-400">Press Enter or comma to add. Backspace to remove last.</p>
            </div>
          </div>
        </section>

        {/* Template */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => set('template_id', t.id)}
                className={`text-left p-3 rounded-lg border-2 transition-colors flex items-start gap-3 ${
                  form.template_id === t.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                <span className="text-2xl leading-none shrink-0">{t.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Colors */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Colors</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorPicker label="Primary"    value={form.config.primary_color}   onChange={(v) => setConfig('primary_color', v)} />
            <ColorPicker label="Secondary"  value={form.config.secondary_color} onChange={(v) => setConfig('secondary_color', v)} />
            <ColorPicker label="Background" value={form.config.bg_color}        onChange={(v) => setConfig('bg_color', v)} />
            <ColorPicker label="Text"       value={form.config.text_color}      onChange={(v) => setConfig('text_color', v)} />
          </div>
          <div className="mt-3 h-6 rounded-lg overflow-hidden flex">
            {['primary_color', 'secondary_color', 'bg_color', 'text_color'].map((k) => (
              <div key={k} className="flex-1" style={{ backgroundColor: form.config[k] }} />
            ))}
          </div>
        </section>

        {/* Default Images (edit mode only — requires site to be saved first) */}
        {isEdit && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Default Images</h3>
              <button
                type="button"
                onClick={handleFetchDefaultImages}
                disabled={imagesLoading}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
              >
                {imagesLoading ? 'Loading…' : defaultImages.length ? '↻ Refresh all' : '✦ Fetch images'}
              </button>
            </div>
            {defaultImages.length > 0 ? (
              <div className="grid grid-cols-5 gap-2">
                {defaultImages.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-video bg-gray-100">
                    <img
                      src={url}
                      alt={`Default image ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleReplaceImage(i)}
                      disabled={imagesLoading}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold"
                    >
                      Replace
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
                No default images set. Click "Fetch images" to generate 5 curated photos.
              </p>
            )}
          </section>
        )}

        {/* Active toggle (edit only) */}
        {isEdit && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status</h3>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                <div className={`w-10 h-6 rounded-full transition-colors ${form.is_active ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">{form.is_active ? 'Active' : 'Inactive'}</span>
            </label>
          </section>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Site'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
