import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { getArticle, updateArticle, removeArticle } from '../../services/articles'
import { getCategories } from '../../services/categories'
import { getSites } from '../../services/sites'
import Spinner from '../../components/Spinner'
import ConfirmDialog from '../../components/ConfirmDialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function AiScoreBadge({ score }) {
  if (score == null) return <span className="text-sm text-gray-400">No score</span>
  const pct = Math.round(score * 100)
  const cls = score >= 0.7
    ? 'bg-green-100 text-green-700 border border-green-200'
    : score >= 0.4
    ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
    : 'bg-red-100 text-red-700 border border-red-200'
  return (
    <span className={`inline-block rounded-lg px-3 py-1 text-sm font-semibold ${cls}`}>
      AI Score: {pct}%
    </span>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    published: 'bg-green-100 text-green-700',
    removed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

/** Convert plain text with \n\n to HTML paragraphs for Quill */
function plaintextToHtml(text) {
  if (!text) return ''
  // If it already looks like HTML, pass through
  if (text.trimStart().startsWith('<')) return text
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// ---------------------------------------------------------------------------
// Quill body editor
// ---------------------------------------------------------------------------

function QuillBodyEditor({ value, onSave, images = [] }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef(null)
  const quillRef = useRef(null)

  useEffect(() => {
    if (!editing || quillRef.current) return

    quillRef.current = new Quill(containerRef.current, {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ header: [1, 2, 3, false] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'link', 'image'],
          ['clean'],
        ],
      },
    })

    quillRef.current.clipboard.dangerouslyPasteHTML(plaintextToHtml(value))
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy Quill instance when leaving edit mode
  useEffect(() => {
    if (!editing && quillRef.current) {
      quillRef.current = null
    }
  }, [editing])

  function insertImage(url) {
    if (!quillRef.current) return
    const range = quillRef.current.getSelection(true)
    quillRef.current.insertEmbed(range.index, 'image', url)
    quillRef.current.setSelection(range.index + 1)
  }

  async function handleSave() {
    if (!quillRef.current) return
    setSaving(true)
    const html = quillRef.current.getSemanticHTML()
    await onSave(html)
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    quillRef.current = null
    setEditing(false)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Body</label>
        {!editing && (
          <button className="text-xs text-indigo-600 hover:underline" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div>
          {/* Quill container */}
          <div ref={containerRef} style={{ minHeight: 220 }} />

          {/* Image gallery for click-to-insert */}
          {images.length > 0 && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Click an image to insert at cursor:</p>
              <div className="flex flex-wrap gap-2">
                {images.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => insertImage(url)}
                    className="border border-gray-200 rounded overflow-hidden hover:border-indigo-400 hover:ring-1 hover:ring-indigo-300 transition-all"
                    title={url}
                  >
                    <img
                      src={url}
                      alt=""
                      className="h-16 w-24 object-cover"
                      onError={(e) => { e.target.parentElement.style.display = 'none' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="text-sm text-gray-800 leading-relaxed max-h-64 overflow-y-auto border border-gray-100 rounded-lg p-3 bg-gray-50 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: plaintextToHtml(value) || '<em class="text-gray-400">No body text</em>' }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic inline editable field (for non-body fields)
// ---------------------------------------------------------------------------

function EditableField({ label, value, onSave, multiline = false, type = 'text' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setDraft(value ?? '')
    setEditing(false)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
        {!editing && (
          <button
            className="text-xs text-indigo-600 hover:underline"
            onClick={() => { setDraft(value ?? ''); setEditing(true) }}
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <textarea
              className="input-field text-sm"
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              type={type}
              className="input-field text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={`text-sm text-gray-800 ${multiline ? 'whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto border border-gray-100 rounded-lg p-3 bg-gray-50' : ''}`}>
          {value || <span className="text-gray-400 italic">Not set</span>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ArticleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmRemove, setConfirmRemove] = useState(false)

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['cms-article', id],
    queryFn: () => getArticle(id),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['cms-categories'],
    queryFn: () => getCategories(),
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const updateMut = useMutation({
    mutationFn: (data) => updateArticle(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms-article', id] })
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
    },
  })

  const removeMut = useMutation({
    mutationFn: () => removeArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cms-articles'] })
      qc.invalidateQueries({ queryKey: ['article-stats'] })
      navigate('/cms/articles')
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !article) return <p className="text-sm text-red-600">Article not found.</p>

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))
  const siteCategories = categories.filter((c) => c.site_id === article.site_id)

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-400 mb-4">
        <Link to="/cms/articles" className="hover:text-gray-600">Articles</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700 line-clamp-1">{article.title}</span>
      </div>

      {/* Header strip */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          <AiScoreBadge score={article.ai_score} />
          <StatusBadge status={article.status} />
          {article.is_pinned && (
            <span className="inline-block rounded-full px-3 py-1 text-sm font-medium bg-indigo-100 text-indigo-700">
              📌 Pinned
            </span>
          )}
          {article.translated_from && (
            <span className="inline-block rounded-full px-3 py-1 text-sm font-medium bg-purple-100 text-purple-700">
              🌐 Translated from {article.translated_from.toUpperCase()}
            </span>
          )}
          <span className="text-sm text-gray-400">
            {siteMap[article.site_id] ?? `Site #${article.site_id}`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => updateMut.mutate({ is_pinned: !article.is_pinned })}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-gray-300 hover:text-gray-800"
          >
            {article.is_pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            onClick={() => setConfirmRemove(true)}
            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm hover:bg-red-100"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <EditableField
              label="Title"
              value={article.title}
              onSave={(v) => updateMut.mutateAsync({ title: v })}
            />

            <QuillBodyEditor
              value={article.body}
              images={article.images ?? []}
              onSave={(v) => updateMut.mutateAsync({ body: v })}
            />

            <EditableField
              label="Image URL"
              value={article.image_url}
              type="url"
              onSave={(v) => updateMut.mutateAsync({ image_url: v || null })}
            />
            {article.image_url && (
              <div className="mt-2 mb-4">
                <img
                  src={article.image_url}
                  alt=""
                  className="max-h-48 rounded-lg object-cover border border-gray-100"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              </div>
            )}
          </div>

          {/* SEO fields */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">SEO / Meta</h3>
            <EditableField
              label="SEO Title"
              value={article.seo_title}
              onSave={(v) => updateMut.mutateAsync({ seo_title: v || null })}
            />
            <EditableField
              label="SEO Description"
              value={article.seo_description}
              multiline
              onSave={(v) => updateMut.mutateAsync({ seo_description: v || null })}
            />
            <EditableField
              label="SEO Keywords"
              value={article.seo_keywords}
              onSave={(v) => updateMut.mutateAsync({ seo_keywords: v || null })}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* AI info */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">AI Analysis</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Score</span>
                <AiScoreBadge score={article.ai_score} />
              </div>
              {article.ai_flags ? (
                <div>
                  <div className="text-gray-500 mb-1.5">Flags</div>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      try {
                        const flags = JSON.parse(article.ai_flags)
                        return (Array.isArray(flags) ? flags : [article.ai_flags]).map((flag) => (
                          <span
                            key={flag}
                            className="inline-block bg-orange-50 text-orange-700 border border-orange-200 text-xs rounded px-2 py-0.5"
                          >
                            {flag}
                          </span>
                        ))
                      } catch {
                        return article.ai_flags.split(',').map((f) => f.trim()).filter(Boolean).map((flag) => (
                          <span key={flag} className="inline-block bg-orange-50 text-orange-700 border border-orange-200 text-xs rounded px-2 py-0.5">
                            {flag}
                          </span>
                        ))
                      }
                    })()}
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 text-xs italic">No flags</div>
              )}
            </div>
          </div>

          {/* Category */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Category</h3>
            <select
              className="input-field text-sm"
              value={article.category_id ?? ''}
              onChange={(e) => updateMut.mutate({ category_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">— None —</option>
              {siteCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Metadata */}
          <div className="card text-sm text-gray-500 space-y-2">
            <div className="flex justify-between">
              <span>ID</span>
              <span className="text-gray-700 font-mono">{article.id}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0">Source</span>
              {article.source_url ? (
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:underline truncate max-w-[160px]"
                  title={article.source_url}
                >
                  {new URL(article.source_url).hostname} ↗
                </a>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
            {article.translated_from && (
              <div className="flex justify-between">
                <span>Translated from</span>
                <span className="text-purple-600 font-medium">{article.translated_from.toUpperCase()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Created</span>
              <span className="text-gray-700">
                {new Date(article.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Updated</span>
              <span className="text-gray-700">
                {new Date(article.updated_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Images from source */}
          {article.images && article.images.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Source Images ({article.images.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {article.images.slice(0, 6).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-20 object-cover rounded border border-gray-100 hover:opacity-80 transition-opacity"
                      onError={(e) => { e.target.parentElement.style.display = 'none' }}
                    />
                  </a>
                ))}
              </div>
              {article.images.length > 6 && (
                <p className="text-xs text-gray-400 mt-2">+{article.images.length - 6} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove article?"
          message="This will mark the article as removed."
          confirmLabel="Remove"
          loading={removeMut.isPending}
          onConfirm={() => removeMut.mutate()}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  )
}
