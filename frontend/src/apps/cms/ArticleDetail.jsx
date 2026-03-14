import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { getArticle, updateArticle } from '../../services/articles'
import { getSites } from '../../services/sites'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
  removed: 'bg-red-100 text-red-800',
}

// ---------------------------------------------------------------------------
// TipTap rich-text editor
// ---------------------------------------------------------------------------

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        active
          ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function TipTapEditor({ value, rtl, onSave }) {
  const [saving, setSaving] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showImgInput, setShowImgInput] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: value || '',
  })

  // Sync content when article changes (e.g. after AI review)
  useEffect(() => {
    if (editor && value !== undefined) {
      const current = editor.getHTML()
      if (current !== value) {
        editor.commands.setContent(value || '', false)
      }
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!editor) return
    setSaving(true)
    try {
      await onSave(editor.getHTML())
    } finally {
      setSaving(false)
    }
  }

  const insertImage = () => {
    const url = imageUrl.trim()
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run()
      setImageUrl('')
      setShowImgInput(false)
    }
  }

  if (!editor) return null

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 bg-gray-50">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <s>S</s>
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-0.5" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          H2
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          H3
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-0.5" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          • List
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">
          1. List
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          " Quote
        </ToolbarButton>

        <span className="w-px h-4 bg-gray-300 mx-0.5" />

        <ToolbarButton onClick={() => setShowImgInput(!showImgInput)} active={showImgInput} title="Insert image">
          🖼 Image
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} active={false} title="Clear formatting">
          ✕ Clear
        </ToolbarButton>

        <div className="ml-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Saving…' : 'Save content'}
          </button>
        </div>
      </div>

      {/* Image URL input */}
      {showImgInput && (
        <div className="flex gap-2 items-center px-3 py-2 border-b border-gray-200 bg-blue-50">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && insertImage()}
            placeholder="https://example.com/image.jpg"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
          <button
            type="button"
            onClick={insertImage}
            disabled={!imageUrl.trim()}
            className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Insert
          </button>
          <button
            type="button"
            onClick={() => { setShowImgInput(false); setImageUrl('') }}
            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Editor content */}
      <EditorContent
        editor={editor}
        dir={rtl ? 'rtl' : 'ltr'}
        className="cms-editor p-4 min-h-64 focus:outline-none"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable meta field
// ---------------------------------------------------------------------------

function EditableField({ label, value, onSave, multiline = false, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (e) {
      alert('Save failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
        {!editing && (
          <button
            onClick={() => { setDraft(value || ''); setEditing(true) }}
            className="text-xs text-indigo-600 hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          {multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
            />
          ) : (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {value || <span className="text-gray-400 italic">Not set</span>}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ArticleDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()

  const { data: article, isLoading, error } = useQuery({
    queryKey: ['article', id],
    queryFn: () => getArticle(id),
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: getSites,
  })

  const updateMutation = useMutation({
    mutationFn: (data) => updateArticle(id, data),
    onSuccess: (updated) => queryClient.setQueryData(['article', id], updated),
  })

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading article…</div>
  }

  if (error || !article) {
    return <div className="p-8 text-center text-red-500">Article not found.</div>
  }

  const site = sites.find((s) => s.id === article.site_id)
  const siteLang = site?.language || 'en'
  const rtl = ['he', 'ar'].includes(siteLang)

  const aiFlags = (() => {
    if (!article.ai_flags) return []
    try { return JSON.parse(article.ai_flags) } catch { return article.ai_flags.split(',').map((f) => f.trim()).filter(Boolean) }
  })()

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Top nav */}
      <div className="flex items-center justify-between">
        <Link to="/cms/articles" className="text-sm text-indigo-600 hover:underline">
          ← Back to Articles
        </Link>
        <div className="flex items-center gap-3">
          {article.translated_from && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
              Translated from {article.translated_from.toUpperCase()}
            </span>
          )}
          <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[article.status] || ''}`}>
            {article.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content — 2/3 width */}
        <div className="col-span-2 space-y-4">
          {/* Title */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <EditableField
              label="Title"
              value={article.title}
              onSave={(v) => updateMutation.mutateAsync({ title: v })}
            />
          </div>

          {/* Main image */}
          {article.main_image_url && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Main Image</p>
              <img
                src={article.main_image_url}
                alt={article.title}
                className="w-full rounded-lg object-cover"
                style={{ maxHeight: '300px' }}
              />
            </div>
          )}

          {/* Content editor */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Content</p>
            <TipTapEditor
              key={article.id}
              value={article.content_html || ''}
              rtl={rtl}
              onSave={async (html) => {
                await updateMutation.mutateAsync({ content_html: html })
              }}
            />
          </div>
        </div>

        {/* Sidebar — 1/3 width */}
        <div className="space-y-4">
          {/* AI Review */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Review</p>
            {article.ai_score != null ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-indigo-500"
                      style={{ width: `${Math.round(article.ai_score * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round(article.ai_score * 100)}%
                  </span>
                </div>
                {aiFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {aiFlags.map((f) => (
                      <span key={f} className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full border border-red-200">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-400 italic text-sm">Not reviewed yet</p>
            )}
          </div>

          {/* Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
            <select
              value={article.status}
              onChange={(e) => updateMutation.mutate({ status: e.target.value })}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="pending">Pending</option>
              <option value="published">Published</option>
              <option value="removed">Removed</option>
            </select>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">SEO</p>
            <EditableField
              label="SEO Title"
              value={article.seo_title}
              onSave={(v) => updateMutation.mutateAsync({ seo_title: v })}
            />
            <EditableField
              label="Meta Description"
              value={article.seo_description}
              onSave={(v) => updateMutation.mutateAsync({ seo_description: v })}
              multiline
            />
            <EditableField
              label="Keywords"
              value={article.seo_keywords}
              onSave={(v) => updateMutation.mutateAsync({ seo_keywords: v })}
            />
          </div>

          {/* Pin */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pin</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={article.is_pinned}
                onChange={(e) => updateMutation.mutate({ is_pinned: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Pinned to top</span>
            </label>
            {article.is_pinned && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Pin order</label>
                <input
                  type="number"
                  min={0}
                  value={article.pin_order ?? ''}
                  onChange={(e) =>
                    updateMutation.mutate({ pin_order: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* Source */}
          {article.source_url && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Source</p>
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:underline break-all"
              >
                {(() => { try { return new URL(article.source_url).hostname } catch { return article.source_url } })()}
              </a>
            </div>
          )}

          {/* Dates */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dates</p>
            <p className="text-xs text-gray-600">
              <span className="font-medium">Created:</span>{' '}
              {new Date(article.created_at).toLocaleString()}
            </p>
            <p className="text-xs text-gray-600">
              <span className="font-medium">Updated:</span>{' '}
              {new Date(article.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
