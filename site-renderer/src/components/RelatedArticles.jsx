/**
 * RelatedArticles — shows up to 3 articles related to the current one.
 *
 * Matching priority:
 *  1. Same category as the current article (up to 3)
 *  2. Fill remaining slots from other articles on the same site
 *
 * All data is sourced client-side from SiteContext — no extra API calls.
 */

import { useMemo } from 'react'
import ArticleCard from './ArticleCard'
import { useSite } from '../contexts/SiteContext'

export default function RelatedArticles({ article }) {
  const { articles: allArticles, categoryMap } = useSite()

  const related = useMemo(() => {
    if (!allArticles || allArticles.length === 0) return []
    const currentId = Number(article.id)
    const others = allArticles.filter((a) => a.id !== currentId)
    if (article.category_id) {
      const sameCategory = others.filter((a) => a.category_id === article.category_id)
      if (sameCategory.length >= 3) return sameCategory.slice(0, 3)
      const otherCat = others.filter((a) => a.category_id !== article.category_id)
      return [...sameCategory, ...otherCat].slice(0, 3)
    }
    return others.slice(0, 3)
  }, [allArticles, article.id, article.category_id])

  if (!related.length) return null

  return (
    <section
      className="border-t py-10"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
    >
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--color-text)' }}>
          Related articles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {related.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              category={categoryMap[a.category_id] || null}
              variant="default"
            />
          ))}
        </div>
      </div>
    </section>
  )
}
