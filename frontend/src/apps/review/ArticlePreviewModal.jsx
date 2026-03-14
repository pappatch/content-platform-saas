import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getArticle } from '../../services/articles'
import { getSites } from '../../services/sites'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'

function AiScoreBadge({ score }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>
  const pct = Math.round(score * 100)
  const cls =
    score >= 0.7
      ? 'bg-green-100 text-green-700'
      : score >= 0.5
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {pct}%
    </span>
  )
}

function FlagChip({ label }) {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 border border-orange-200">
      {label}
    </span>
  )
}

/**
 * ArticlePreviewModal
 *
 * Lazy-fetches the full article on open (articleId != null).
 * Sites are fetched with the same query key used by ReviewQueue so React Query
 * serves the result from cache — no extra network round-trip.
 *
 * Props:
 *   articleId       – ID to fetch; modal is mounted only when non-null
 *   onApprove(id)   – called when Approve is clicked; parent owns mutation
 *   onRejectRequest(id) – called when Reject is clicked; opens confirm dialog in parent
 *   approvePending  – disables Approve button while mutation is in flight
 *   rejectPending   – disables Reject button while mutation is in flight
 *   onClose         – close the modal
 */
export default function ArticlePreviewModal({
  articleId,
  onApprove,
  onRejectRequest,
  approvePending,
  rejectPending,
  onClose,
}) {
  const { data: article, isLoading } = useQuery({
    queryKey: ['review-article', articleId],
    queryFn: () => getArticle(articleId),
    enabled: articleId != null,
  })

  // Uses the same query key as ReviewQueue → served from cache
  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const siteMap = useMemo(
    () => Object.fromEntries(sites.map((s) => [s.id, s.name])),
    [sites],
  )

  const flags = useMemo(() => {
    try { return article?.ai_flags ? JSON.parse(article.ai_flags) : [] }
    catch { return [] }
  }, [article?.ai_flags])

  return (
    <Modal title="Article Preview" onClose={onClose} size="xl">
      {isLoading || !article ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col">

          {/* ── Meta bar ──────────────────────────────────────────────── */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
            <span>
              <span className="font-medium text-gray-700">Site:</span>{' '}
              {siteMap[article.site_id] ?? `#${article.site_id}`}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-gray-700">AI Score:</span>
              <AiScoreBadge score={article.ai_score} />
            </span>
            <span>
              <span className="font-medium text-gray-700">Date:</span>{' '}
              {new Date(article.created_at).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </span>
            {article.source_url && (
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 hover:underline truncate max-w-xs"
              >
                Source ↗
              </a>
            )}
          </div>

          {/* ── Flags ─────────────────────────────────────────────────── */}
          {flags.length > 0 && (
            <div className="px-6 py-2 bg-orange-50 border-b border-orange-100 flex items-center flex-wrap gap-1.5">
              <span className="text-xs font-medium text-orange-700 mr-1">Flags:</span>
              {flags.map((f) => <FlagChip key={f} label={f} />)}
            </div>
          )}

          {/* ── Main image with broken-URL fallback ───────────────────── */}
          {article.main_image_url && (
            <div className="px-6 pt-5">
              <img
                src={article.main_image_url}
                alt={article.title}
                className="w-full max-h-60 object-cover rounded-lg"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}

          {/* ── Title + rendered content_html ─────────────────────────── */}
          <div className="px-6 py-5">
            <h1 className="text-xl font-bold text-gray-900 mb-4 leading-snug">
              {article.title}
            </h1>
            {article.content_html ? (
              // SECURITY: content_html is sanitized server-side by app/utils/sanitize.py
              // before being stored.  For additional defence-in-depth, consider running
              // DOMPurify here: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content_html) }}
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: article.content_html }}
              />
            ) : (
              <p className="text-sm italic text-gray-400">No content available.</p>
            )}
          </div>

          {/* ── SEO block ─────────────────────────────────────────────── */}
          {(article.seo_title || article.seo_description || article.seo_keywords) && (
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">SEO</p>
              {article.seo_title && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Title:</span> {article.seo_title}
                </p>
              )}
              {article.seo_description && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Description:</span> {article.seo_description}
                </p>
              )}
              {article.seo_keywords && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Keywords:</span> {article.seo_keywords}
                </p>
              )}
            </div>
          )}

          {/* ── Footer actions ────────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              onClick={() => onRejectRequest(article.id)}
              disabled={rejectPending}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {rejectPending ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              onClick={() => onApprove(article.id)}
              disabled={approvePending}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {approvePending ? 'Approving…' : 'Approve'}
            </button>
          </div>

        </div>
      )}
    </Modal>
  )
}
