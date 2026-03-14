/**
 * InfiniteFeed — generic paginated article feed.
 *
 * Renders articles in pages of `pageSize` (default 10). An IntersectionObserver
 * sentinel auto-loads the next page as the user scrolls near the bottom.
 * A visible "Load more" button doubles as a manual fallback.
 *
 * Props:
 *  articles      {Object[]}  - full sorted list to paginate
 *  renderItem    {Function}  - (article, index) => ReactNode  — caller owns card UI
 *  pageSize      {number}    - articles per page (default 10)
 *  gridClassName {string}    - className for the items grid (e.g. "grid grid-cols-3 gap-6")
 */

import { useState, useEffect, useRef } from 'react'

export default function InfiniteFeed({ articles, renderItem, pageSize = 10, gridClassName = '' }) {
  const [visible, setVisible] = useState(pageSize)
  const sentinelRef = useRef(null)
  const hasMore = visible < articles.length

  // Reset when the article list changes (e.g. category filter applied)
  useEffect(() => {
    setVisible(pageSize)
  }, [articles, pageSize])

  // Auto-load next page when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!hasMore || !sentinel || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible((v) => Math.min(v + pageSize, articles.length))
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, articles.length, pageSize])

  return (
    <>
      <div className={gridClassName}>
        {articles.slice(0, visible).map((article, i) => renderItem(article, i))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center mt-10 pb-4">
          <button
            onClick={() => setVisible((v) => Math.min(v + pageSize, articles.length))}
            className="px-6 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            Load more
          </button>
        </div>
      )}
    </>
  )
}
