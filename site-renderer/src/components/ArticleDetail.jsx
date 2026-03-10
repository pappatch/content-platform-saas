import { Link } from 'react-router-dom'
import { formatDate } from './ArticleCard'

export default function ArticleDetail({ article, category, site, theme }) {
  const title = article.seo_title || article.title
  const paragraphs = article.body.split(/\n+/).filter(Boolean)

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

      <div className="max-w-3xl mx-auto px-4 py-10">
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
        {article.image_url && (
          <div className="mt-6 rounded-xl overflow-hidden">
            <img
              src={article.image_url}
              alt={article.title}
              className="w-full object-cover max-h-96"
            />
          </div>
        )}

        {/* Body */}
        <div className="mt-8 space-y-4 text-base leading-relaxed">
          {paragraphs.map((para, i) => (
            <p key={i} style={{ color: 'var(--color-text)' }}>{para}</p>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Link
            to="/"
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-secondary)' }}
          >
            ← Back to {site?.name || 'Home'}
          </Link>
        </div>
      </div>
    </article>
  )
}
