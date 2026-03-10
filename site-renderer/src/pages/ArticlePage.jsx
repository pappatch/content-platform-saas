import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getArticle } from '../api/public'
import { useSite } from '../contexts/SiteContext'
import ArticleDetail from '../components/ArticleDetail'
import NotFound from './NotFound'

export default function ArticlePage() {
  const { id } = useParams()
  const { site, categoryMap, theme } = useSite()

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['article', id],
    queryFn: () => getArticle(id),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)', ...theme }}>
        <div className="h-8 w-8 rounded-full border-4 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    )
  }

  if (isError || !article) return <NotFound />

  // Apply RTL if article's site has RTL language
  const dir = site?.text_direction || 'ltr'
  const category = article.category_id ? categoryMap[article.category_id] : null

  return (
    <div dir={dir} style={theme}>
      <ArticleDetail article={article} category={category} site={site} theme={theme} />
    </div>
  )
}
