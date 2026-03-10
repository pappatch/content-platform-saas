/**
 * Template B — Magazine
 * Immersive hero with background image + gradient overlay,
 * then a highlighted row of 2, then 3-column grid.
 */
import { Link } from 'react-router-dom'
import { formatDate, excerpt } from '../components/ArticleCard'

export default function TemplateB({ site, articles, categories, categoryMap, theme, pageTitle, headerExtra }) {
  const dir = site?.text_direction || 'ltr'
  const hero = articles[0] || null
  const spotlight = articles.slice(1, 3)
  const rest = articles.slice(3)

  return (
    <div dir={dir} style={{ ...theme, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }} className="min-h-screen">
      {/* Top nav */}
      <nav style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-2xl font-black tracking-tight">{site?.name}</Link>
          <div className="flex items-center gap-4 text-sm font-medium overflow-x-auto">
            <Link to="/" className="opacity-75 hover:opacity-100 shrink-0">Home</Link>
            {categories.slice(0, 5).map((cat) => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="opacity-75 hover:opacity-100 shrink-0">
                {cat.name}
              </Link>
            ))}
          </div>
          {headerExtra}
        </div>
      </nav>

      {/* Hero */}
      {hero && (
        <div className="relative h-96 md:h-[520px] overflow-hidden">
          {hero.image_url
            ? <img src={hero.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0" style={{ backgroundColor: 'var(--color-primary)' }} />
          }
          {/* Gradient overlay */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
              {pageTitle ? (
                <span className="inline-block text-xs font-bold uppercase tracking-widest text-white bg-white/20 px-3 py-1 rounded-full mb-3">{pageTitle}</span>
              ) : categoryMap[hero.category_id] ? (
                <Link to={`/category/${categoryMap[hero.category_id].slug}`}
                  className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3 hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-secondary)', color: '#fff' }}>
                  {categoryMap[hero.category_id].name}
                </Link>
              ) : null}
              <Link to={`/article/${hero.id}`} className="block group">
                <h1 className="text-3xl md:text-5xl font-black text-white leading-tight group-hover:underline max-w-3xl">
                  {hero.seo_title || hero.title}
                </h1>
              </Link>
              <p className="mt-3 text-white/75 text-base max-w-2xl line-clamp-2">
                {excerpt(hero.body, 180)}
              </p>
              <time className="block mt-2 text-white/50 text-sm">{formatDate(hero.created_at)}</time>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Spotlight row */}
        {spotlight.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {spotlight.map((article) => (
              <Link key={article.id} to={`/article/${article.id}`} className="group relative overflow-hidden rounded-xl h-56">
                {article.image_url
                  ? <img src={article.image_url} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : <div className="absolute inset-0 opacity-90" style={{ backgroundColor: 'var(--color-primary)' }} />
                }
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)' }} />
                <div className="absolute bottom-0 p-4">
                  {categoryMap[article.category_id] && (
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-secondary)' }}>
                      {categoryMap[article.category_id].name}
                    </span>
                  )}
                  <h3 className="text-white font-bold text-lg leading-snug line-clamp-2 group-hover:underline">
                    {article.seo_title || article.title}
                  </h3>
                  <time className="text-white/50 text-xs">{formatDate(article.created_at)}</time>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Divider */}
        {rest.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-1 w-8 rounded-full" style={{ backgroundColor: 'var(--color-secondary)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>More Stories</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map((article) => (
                <Link key={article.id} to={`/article/${article.id}`} className="group flex flex-col rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                  {article.image_url && (
                    <img src={article.image_url} alt="" className="w-full aspect-video object-cover group-hover:brightness-95 transition-all" />
                  )}
                  <div className="flex-1 p-4 flex flex-col">
                    {categoryMap[article.category_id] && (
                      <span className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-secondary)' }}>
                        {categoryMap[article.category_id].name}
                      </span>
                    )}
                    <h3 className="font-bold text-sm leading-snug line-clamp-2 group-hover:underline flex-1" style={{ color: 'var(--color-text)' }}>
                      {article.seo_title || article.title}
                    </h3>
                    <time className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>{formatDate(article.created_at)}</time>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {articles.length === 0 && (
          <p className="text-center py-20" style={{ color: 'var(--color-muted)' }}>No articles published yet.</p>
        )}
      </div>

      <footer className="mt-12 py-8 text-sm text-center" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
        © {new Date().getFullYear()} {site?.name}
      </footer>
    </div>
  )
}
