/**
 * Template A — Newspaper
 * Dense multi-column grid, dark masthead, serif-weight headings.
 * Featured article spans full width, rest in 3-col grid.
 */
import { Link } from 'react-router-dom'
import ArticleCard, { formatDate, excerpt } from '../components/ArticleCard'

export default function TemplateA({ site, articles, categories, categoryMap, theme, pageTitle, headerExtra }) {
  const dir = site?.text_direction || 'ltr'
  const featured = articles[0] || null
  const rest = articles.slice(1)

  return (
    <div dir={dir} style={{ ...theme, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} className="min-h-screen font-sans">
      {/* Masthead */}
      <header style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Link to="/" className="text-3xl font-black tracking-tight">{site?.name}</Link>
          {headerExtra}
        </div>
        {/* Category nav */}
        {categories.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="max-w-6xl mx-auto px-4 py-2 flex gap-4 overflow-x-auto text-sm font-medium flex-nowrap">
              <Link to="/" className="shrink-0 opacity-75 hover:opacity-100 hover:underline">All</Link>
              {categories.map((cat) => (
                <Link key={cat.id} to={`/category/${cat.slug}`} className="shrink-0 opacity-75 hover:opacity-100 hover:underline">
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {pageTitle && (
          <div className="mb-6 pb-3" style={{ borderBottom: '3px solid var(--color-primary)' }}>
            <h2 className="text-xl font-black uppercase tracking-wide">{pageTitle}</h2>
          </div>
        )}

        {/* Featured article */}
        {featured && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6" style={{ borderBottom: '2px solid var(--color-border)', paddingBottom: '2rem' }}>
            {featured.main_image_url && (
              <Link to={`/article/${featured.id}`} className="block overflow-hidden rounded-lg">
                <img src={featured.main_image_url} alt="" className="w-full aspect-video object-cover hover:scale-105 transition-transform duration-300"
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }} />
              </Link>
            )}
            <div className={featured.main_image_url ? '' : 'md:col-span-2'}>
              {featured.is_pinned && (
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-secondary)' }}>★ Featured</span>
              )}
              {categoryMap[featured.category_id] && (
                <Link to={`/category/${categoryMap[featured.category_id].slug}`}
                  className="block text-xs font-bold uppercase tracking-widest mt-1 hover:underline"
                  style={{ color: 'var(--color-secondary)' }}>
                  {categoryMap[featured.category_id].name}
                </Link>
              )}
              <Link to={`/article/${featured.id}`} className="group">
                <h2 className="mt-2 text-3xl font-black leading-tight group-hover:underline" style={{ color: 'var(--color-text)' }}>
                  {featured.seo_title || featured.title}
                </h2>
              </Link>
              <p className="mt-3 text-base leading-relaxed line-clamp-4" style={{ color: 'var(--color-muted)' }}>
                {excerpt(featured, 240)}
              </p>
              <time className="block mt-3 text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
                {formatDate(featured.created_at)}
              </time>
            </div>
          </div>
        )}

        {/* Article grid */}
        {rest.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((article) => (
              <div key={article.id} className="group">
                {article.main_image_url && (
                  <Link to={`/article/${article.id}`} className="block overflow-hidden rounded mb-2">
                    <img src={article.main_image_url} alt="" className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }} />
                  </Link>
                )}
                {article.is_pinned && (
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-secondary)' }}>★ </span>
                )}
                {categoryMap[article.category_id] && (
                  <Link to={`/category/${categoryMap[article.category_id].slug}`}
                    className="text-xs font-bold uppercase tracking-widest hover:underline"
                    style={{ color: 'var(--color-secondary)' }}>
                    {categoryMap[article.category_id].name}
                  </Link>
                )}
                <Link to={`/article/${article.id}`}>
                  <h3 className="mt-1 text-base font-bold leading-snug line-clamp-2 hover:underline" style={{ color: 'var(--color-text)' }}>
                    {article.seo_title || article.title}
                  </h3>
                </Link>
                <p className="mt-1 text-sm line-clamp-2" style={{ color: 'var(--color-muted)' }}>
                  {excerpt(article)}
                </p>
                <time className="block mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {formatDate(article.created_at)}
                </time>
              </div>
            ))}
          </div>
        )}

        {articles.length === 0 && (
          <p className="text-center py-20" style={{ color: 'var(--color-muted)' }}>No articles published yet.</p>
        )}
      </main>

      <footer style={{ backgroundColor: 'var(--color-primary)', color: 'rgba(255,255,255,0.6)' }} className="mt-12 py-6 text-sm text-center">
        © {new Date().getFullYear()} {site?.name}
      </footer>
    </div>
  )
}
