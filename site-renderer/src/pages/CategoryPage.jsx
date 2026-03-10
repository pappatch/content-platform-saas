import { useParams, Link } from 'react-router-dom'
import { useSite } from '../contexts/SiteContext'
import TemplateRouter from '../templates/TemplateRouter'
import NotFound from './NotFound'

export default function CategoryPage() {
  const { slug } = useParams()
  const { site, articles, categories, categoryMap, theme, isLoading } = useSite()

  const category = categories.find((c) => c.slug === slug)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)', ...theme }}>
        <div className="h-8 w-8 rounded-full border-4 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    )
  }

  if (!category) return <NotFound />

  const filtered = articles.filter((a) => a.category_id === category.id)

  return (
    <TemplateRouter
      site={site}
      articles={filtered}
      categories={categories}
      categoryMap={categoryMap}
      theme={theme}
      pageTitle={category.name}
      headerExtra={
        <div className="text-sm opacity-75">
          <Link to="/">← All articles</Link>
        </div>
      }
    />
  )
}
