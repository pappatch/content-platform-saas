import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSite, updateSite } from '../../services/sites'
import Modal from '../../components/Modal'

const LANGUAGES = [
  { value: 'en', label: 'English', dir: 'LTR' },
  { value: 'fr', label: 'French', dir: 'LTR' },
  { value: 'he', label: 'Hebrew', dir: 'RTL' },
  { value: 'ar', label: 'Arabic', dir: 'RTL' },
]

const TEMPLATES = [
  { id: 'template-a', name: 'Newspaper', icon: '📰', desc: 'Dense columns, dark masthead, full-width featured article' },
  { id: 'template-b', name: 'Magazine', icon: '🖼️', desc: 'Full-bleed hero image with overlay, spotlight rows' },
  { id: 'template-c', name: 'Minimal Blog', icon: '✍️', desc: 'Single column, large typography, generous whitespace' },
  { id: 'template-d', name: 'Card Modern', icon: '🃏', desc: 'Uniform cards, gradient header, hover scale effects' },
  { id: 'template-e', name: 'Sidebar Portal', icon: '📑', desc: 'Main content + sidebar with categories and pinned articles' },
]

const IMAGE_POSITIONS = [
  { value: 'hero', label: 'Hero', desc: 'Full-width banner at top' },
  { value: 'sidebar', label: 'Sidebar', desc: 'Thumbnail beside text' },
  { value: 'background', label: 'Background', desc: 'Subtle page background' },
]

const DEFAULT_CONFIG = {
  primary_color: '#4f46e5',
  secondary_color: '#6366f1',
  bg_color: '#ffffff',
  text_color: '#111827',
  image_position: 'hero',
}

function buildEmpty() {
  return { name: '', domain: '', template_id: 'template-a', language: 'en', is_active: true, config: { ...DEFAULT_CONFIG } }
}

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

export default function SiteModal({ site, onClose }) {
  const isEdit = Boolean(site)
  const qc = useQueryClient()
  const [form, setForm] = useState(buildEmpty)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (site) {
      setForm({
        name: site.name,
        domain: site.domain,
        template_id: site.template_id,
        language: site.language,
        is_active: site.is_active,
        config: { ...DEFAULT_CONFIG, ...(site.config || {}) },
      })
    } else {
      setForm(buildEmpty())
    }
    setErrors({})
  }, [site])

  const mutation = useMutation({
    mutationFn: (data) => (isEdit ? updateSite(site.id, data) : createSite(data)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); onClose() },
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

  function handleSubmit(e) {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Required'
    if (!form.domain.trim()) next.domain = 'Required'
    if (Object.keys(next).length) { setErrors(next); return }
    const payload = {
      name: form.name.trim(),
      domain: form.domain.trim(),
      template_id: form.template_id,
      language: form.language,
      config: form.config,
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
            <ColorPicker label="Primary" value={form.config.primary_color} onChange={(v) => setConfig('primary_color', v)} />
            <ColorPicker label="Secondary" value={form.config.secondary_color} onChange={(v) => setConfig('secondary_color', v)} />
            <ColorPicker label="Background" value={form.config.bg_color} onChange={(v) => setConfig('bg_color', v)} />
            <ColorPicker label="Text" value={form.config.text_color} onChange={(v) => setConfig('text_color', v)} />
          </div>
          {/* Color preview strip */}
          <div className="mt-3 h-6 rounded-lg overflow-hidden flex">
            {['primary_color', 'secondary_color', 'bg_color', 'text_color'].map((k) => (
              <div key={k} className="flex-1" style={{ backgroundColor: form.config[k] }} />
            ))}
          </div>
        </section>

        {/* Config */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Image Position</h3>
          <div className="grid grid-cols-3 gap-2">
            {IMAGE_POSITIONS.map(({ value, label, desc }) => (
              <button key={value} type="button" onClick={() => setConfig('image_position', value)}
                className={`py-2 px-3 rounded-lg border-2 text-sm transition-colors ${
                  form.config.image_position === value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                <div className="font-semibold">{label}</div>
                <div className="text-xs opacity-60 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </section>

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
