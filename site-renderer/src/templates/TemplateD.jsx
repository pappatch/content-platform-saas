/**
 * Template D — Card Modern
 * Light gray background, colorful header bar, uniform cards in responsive grid.
 * Each card has a colored top accent, hover scale + shadow effect.
 */
import { Link } from 'react-router-dom'
import { formatDate, excerpt } from '../components/ArticleCard'
import SiteBrand from '../components/SiteBrand'

function CategoryChip({ cat }) {
  return (
    <span className="inline-block text-xs font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
      style={{ backgroundColor: 'var(--color-secondary)', color: '#fff' }}>
      {cat.name}
    </span>
  )
}

export default function TemplateD({ site, articles, categories, categoryMap, theme, pageTitle, headerExtra }) {
  const dir = site?.text_direction || 'ltr'

  return (
    <div dir={dir} style={{ ...theme, backgroundColor: '#f3f4f6', color: 'var(--color-text)' }} className="min-h-screen">
      {/* Header bar */}
      <header className="sticky top-0 z-40" style={{ background: `linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)`, color: '#fff' }}>
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <SiteBrand site={site} nameClassName="text-2xl font-black tracking-tight" />
            {headerExtra}
          </div>
          {categories.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <Link to="/"
                className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                All
              </Link>
              {categories.map((cat) => (
                <Link key={cat.id} to={`/category/${cat.slug}`}
                  className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {pageTitle && (
          <h1 className="text-2xl font-black mb-6" style={{ color: 'var(--color-primary)' }}>{pageTitle}</h1>
        )}

        {articles.length === 0 && (
          <div className="text-center py-20 rounded-2xl bg-white shadow-sm">
            <p style={{ color: 'var(--color-muted)' }}>No articles published yet.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((article) => {
            const cat = categoryMap[article.category_id]
            return (
              <Link
                key={article.id}
                to={`/article/${article.id}`}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col"
              >
                {/* Top accent */}
                <div className="h-1" style={{ background: `linear-gradient(90deg, var(--color-primary), var(--color-secondary))` }} />
                {article.main_image_url && (
                  <img src={article.main_image_url} alt="" className="w-full aspect-video object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                )}
                <div className="flex-1 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    {cat ? <CategoryChip cat={cat} /> : <span />}
                    {article.is_pinned && (
                      <span className="text-xs font-bold" style={{ color: 'var(--color-secondary)' }}>★</span>
                    )}
                  </div>
                  <h3 className="font-bold text-base leading-snug line-clamp-2 group-hover:underline flex-1" style={{ color: 'var(--color-text)' }}>
                    {article.seo_title || article.title}
                  </h3>
                  <p className="text-sm line-clamp-2" style={{ color: 'var(--color-muted)' }}>
                    {excerpt(article)}
                  </p>
                  <time className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                    {formatDate(article.created_at)}
                  </time>
                </div>
              </Link>
            )
          })}
        </div>
      </main>

      <footer className="mt-12 py-6 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
        © {new Date().getFullYear()} {site?.name}
      </footer>
    </div>
  )
}
