/**
 * Template C — Minimal Blog
 * Pure white, centered narrow column, large typography,
 * generous whitespace, text-first with separator lines.
 */
import { Link } from 'react-router-dom'
import { formatDate, excerpt } from '../components/ArticleCard'
import SiteBrand from '../components/SiteBrand'

export default function TemplateC({ site, articles, categories, categoryMap, theme, pageTitle, headerExtra }) {
  const dir = site?.text_direction || 'ltr'

  return (
    <div dir={dir} style={{ ...theme, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} className="min-h-screen">
      {/* Minimal header */}
      <header className="py-12 text-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <SiteBrand site={site} nameClassName="text-4xl font-black tracking-tighter" nameStyle={{ color: 'var(--color-primary)' }} />
        {categories.length > 0 && (
          <div className="mt-4 flex justify-center flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            <Link to="/" className="hover:underline">All</Link>
            {categories.map((cat) => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="hover:underline">{cat.name}</Link>
            ))}
          </div>
        )}
        {headerExtra && <div className="mt-3">{headerExtra}</div>}
      </header>

      {/* Page title (category pages) */}
      {pageTitle && (
        <div className="max-w-2xl mx-auto px-4 pt-10">
          <h1 className="text-2xl font-black" style={{ color: 'var(--color-primary)' }}>{pageTitle}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>{articles.length} article{articles.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Article list */}
      <main className="max-w-2xl mx-auto px-4 py-10">
        {articles.length === 0 && (
          <p className="text-center py-20" style={{ color: 'var(--color-muted)' }}>No articles published yet.</p>
        )}
        {articles.map((article, i) => {
          const cat = categoryMap[article.category_id]
          return (
            <article
              key={article.id}
              className={i > 0 ? 'pt-10 mt-10' : ''}
              style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}
            >
              {/* Category + date */}
              <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
                {cat && (
                  <Link to={`/category/${cat.slug}`} className="hover:underline" style={{ color: 'var(--color-secondary)' }}>
                    {cat.name}
                  </Link>
                )}
                {cat && <span>·</span>}
                <time>{formatDate(article.created_at)}</time>
                {article.is_pinned && <span style={{ color: 'var(--color-secondary)' }}>★ Pinned</span>}
              </div>

              {/* Title */}
              <Link to={`/article/${article.id}`} className="group">
                <h2 className="text-2xl font-bold leading-snug group-hover:underline" style={{ color: 'var(--color-text)' }}>
                  {article.seo_title || article.title}
                </h2>
              </Link>

              {/* Excerpt */}
              <p className="mt-3 text-base leading-relaxed line-clamp-3" style={{ color: 'var(--color-muted)' }}>
                {excerpt(article, 220)}
              </p>

              <Link
                to={`/article/${article.id}`}
                className="inline-block mt-4 text-sm font-semibold hover:underline"
                style={{ color: 'var(--color-secondary)' }}
              >
                {dir === 'rtl' ? '← Read more' : 'Read more →'}
              </Link>
            </article>
          )
        })}
      </main>

      <footer className="py-10 text-xs text-center" style={{ color: 'var(--color-muted)', borderTop: '1px solid var(--color-border)' }}>
        © {new Date().getFullYear()} {site?.name} · All rights reserved
      </footer>
    </div>
  )
}
