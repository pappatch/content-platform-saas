/**
 * Template E — Sidebar + Main
 * Classic portal layout: 2/3 main content with featured article large,
 * then article list; 1/3 sidebar with categories, pinned, recent.
 */
import { Link } from 'react-router-dom'
import { formatDate, excerpt } from '../components/ArticleCard'
import ArticleCard from '../components/ArticleCard'

export default function TemplateE({ site, articles, categories, categoryMap, theme, pageTitle, headerExtra }) {
  const dir = site?.text_direction || 'ltr'

  const featured = articles[0] || null
  const mainList = articles.slice(1, 7)
  const pinned = articles.filter((a) => a.is_pinned).slice(0, 4)
  const recent = articles.slice(0, 5)

  return (
    <div dir={dir} style={{ ...theme, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} className="min-h-screen">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--color-primary)', color: '#fff', borderBottom: '4px solid var(--color-secondary)' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Link to="/" className="text-2xl font-black tracking-tight">{site?.name}</Link>
          <div className="flex items-center gap-4 text-sm font-medium overflow-x-auto">
            <Link to="/" className="opacity-75 hover:opacity-100 shrink-0">Home</Link>
            {categories.slice(0, 6).map((cat) => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="opacity-75 hover:opacity-100 shrink-0">
                {cat.name}
              </Link>
            ))}
          </div>
          {headerExtra}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {pageTitle && (
          <h1 className="text-xl font-black mb-6 pb-3" style={{ color: 'var(--color-primary)', borderBottom: '2px solid var(--color-secondary)' }}>
            {pageTitle}
          </h1>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Featured */}
            {featured && (
              <div className="mb-8">
                {featured.main_image_url && (
                  <Link to={`/article/${featured.id}`} className="block overflow-hidden rounded-xl mb-4">
                    <img src={featured.main_image_url} alt="" className="w-full aspect-video object-cover hover:scale-105 transition-transform duration-300"
                      onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }} />
                  </Link>
                )}
                {categoryMap[featured.category_id] && (
                  <Link to={`/category/${categoryMap[featured.category_id].slug}`}
                    className="text-xs font-bold uppercase tracking-widest hover:underline"
                    style={{ color: 'var(--color-secondary)' }}>
                    {categoryMap[featured.category_id].name}
                  </Link>
                )}
                <Link to={`/article/${featured.id}`} className="group">
                  <h2 className="mt-1 text-2xl font-black leading-tight group-hover:underline" style={{ color: 'var(--color-text)' }}>
                    {featured.seo_title || featured.title}
                  </h2>
                </Link>
                <p className="mt-2 text-sm leading-relaxed line-clamp-3" style={{ color: 'var(--color-muted)' }}>
                  {excerpt(featured, 200)}
                </p>
                <time className="block mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
                  {formatDate(featured.created_at)}
                </time>
              </div>
            )}

            {/* Divider label */}
            {mainList.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 h-0.5" style={{ backgroundColor: 'var(--color-secondary)' }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                  Latest
                </span>
              </div>
            )}

            {/* Main list */}
            <div className="space-y-0">
              {mainList.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  category={categoryMap[article.category_id]}
                  variant="list"
                />
              ))}
            </div>

            {articles.length === 0 && (
              <p className="py-20 text-center" style={{ color: 'var(--color-muted)' }}>No articles published yet.</p>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-72 shrink-0 space-y-8">
            {/* Categories */}
            {categories.length > 0 && (
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest mb-3 pb-2"
                  style={{ color: 'var(--color-primary)', borderBottom: '2px solid var(--color-secondary)' }}>
                  Categories
                </h3>
                <ul className="space-y-2">
                  {categories.map((cat) => {
                    const count = articles.filter((a) => a.category_id === cat.id).length
                    return (
                      <li key={cat.id}>
                        <Link
                          to={`/category/${cat.slug}`}
                          className="flex items-center justify-between text-sm hover:underline"
                          style={{ color: 'var(--color-text)' }}
                        >
                          <span>{cat.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-muted)' }}>
                            {count}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Pinned */}
            {pinned.length > 0 && (
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest mb-3 pb-2"
                  style={{ color: 'var(--color-primary)', borderBottom: '2px solid var(--color-secondary)' }}>
                  ★ Featured
                </h3>
                <div className="space-y-4">
                  {pinned.map((article) => (
                    <ArticleCard key={article.id} article={article} category={categoryMap[article.category_id]} variant="compact" />
                  ))}
                </div>
              </div>
            )}

            {/* Recent */}
            {recent.length > 0 && (
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest mb-3 pb-2"
                  style={{ color: 'var(--color-primary)', borderBottom: '2px solid var(--color-secondary)' }}>
                  Recent
                </h3>
                <div className="space-y-0">
                  {recent.map((a) => (
                    <ArticleCard key={a.id} article={a} category={categoryMap[a.category_id]} variant="list" />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      <footer className="mt-12 py-6 text-sm text-center" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
        © {new Date().getFullYear()} {site?.name}
      </footer>
    </div>
  )
}
