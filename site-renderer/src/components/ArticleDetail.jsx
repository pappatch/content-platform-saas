import { Link } from 'react-router-dom'
import { formatDate } from './ArticleCard'
import { useSite } from '../contexts/SiteContext'
import { getDefaultImage } from '../utils/defaultImages'

export default function ArticleDetail({ article, category, site, theme }) {
  const { siteKeywords } = useSite()
  const title = article.seo_title || article.title
  const dir = site?.text_direction || 'ltr'
  const heroSrc = article.main_image_url || getDefaultImage(siteKeywords, article.id)
  const fallbackSrc = getDefaultImage(siteKeywords, article.id)

  return (
    <article
      style={{ color: 'var(--color-text)', backgroundColor: 'var(--color-bg)', ...theme }}
      className="min-h-screen"
    >
      {/* Breadcrumb */}
      <div
        style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        className="px-4 py-3 text-sm"
      >
        <div className="max-w-3xl mx-auto flex items-center gap-2 flex-wrap">
          <Link to="/" className="opacity-75 hover:opacity-100">{site?.name || 'Home'}</Link>
          {category && (
            <>
              <span className="opacity-50">/</span>
              <Link to={`/category/${category.slug}`} className="opacity-75 hover:opacity-100">
                {category.name}
              </Link>
            </>
          )}
          <span className="opacity-50">/</span>
          <span className="opacity-75 line-clamp-1">{article.title}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10" dir={dir}>
        {/* Category label */}
        {category && (
          <Link
            to={`/category/${category.slug}`}
            className="text-xs font-bold uppercase tracking-widest hover:underline"
            style={{ color: 'var(--color-secondary)' }}
          >
            {category.name}
          </Link>
        )}

        {/* Title */}
        <h1 className="mt-2 text-3xl font-bold leading-tight" style={{ color: 'var(--color-text)' }}>
          {title}
        </h1>

        {/* SEO description as subtitle */}
        {article.seo_description && (
          <p className="mt-3 text-lg" style={{ color: 'var(--color-muted)' }}>
            {article.seo_description}
          </p>
        )}

        {/* Meta */}
        <div className="mt-4 flex items-center gap-4 text-sm" style={{ color: 'var(--color-muted)' }}>
          <time>{formatDate(article.created_at)}</time>
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline truncate max-w-xs"
            >
              Source ↗
            </a>
          )}
        </div>

        {/* Hero image */}
        <div className="mt-6 rounded-xl overflow-hidden">
          <img
            src={heroSrc}
            alt={article.title}
            className="w-full object-cover max-h-96"
            onError={(e) => {
              if (e.currentTarget.src !== fallbackSrc) {
                e.currentTarget.onerror = null
                e.currentTarget.src = fallbackSrc
              }
            }}
          />
        </div>

        {/* Article body */}
        <div className="mt-8 article-content">
          {article.content_html
            ? (
              // SECURITY: content_html is sanitized server-side (app/utils/sanitize.py)
              // before being stored.  For defence-in-depth, consider adding DOMPurify:
              //   import DOMPurify from 'dompurify'
              //   dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content_html) }}
              <div
                dangerouslySetInnerHTML={{ __html: article.content_html }}
                style={{ color: 'var(--color-text)' }}
              />
            )
            : <p style={{ color: 'var(--color-muted)' }}>No content available.</p>
          }
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Link
            to="/"
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-secondary)' }}
          >
            {dir === 'rtl' ? `→ ${site?.name || 'Home'}` : `← Back to ${site?.name || 'Home'}`}
          </Link>
        </div>
      </div>
    </article>
  )
}
