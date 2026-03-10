import { Link } from 'react-router-dom'

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function excerpt(body, length = 120) {
  if (!body) return ''
  const flat = body.replace(/\n+/g, ' ').trim()
  return flat.length > length ? flat.slice(0, length).trimEnd() + '…' : flat
}

/**
 * Shared article card — templates compose or override as needed.
 * Variants: 'default' | 'compact' | 'hero' | 'list'
 */
export default function ArticleCard({ article, category, variant = 'default', style }) {
  const title = article.seo_title || article.title
  const href = `/article/${article.id}`

  if (variant === 'list') {
    return (
      <Link
        to={href}
        className="flex gap-4 py-3 border-b last:border-0 group"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {article.image_url && (
          <img
            src={article.image_url}
            alt=""
            className="w-20 h-16 object-cover rounded shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {category && (
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>
              {category.name}
            </span>
          )}
          <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: 'var(--color-text)' }}>
            {title}
          </h3>
          <time className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {formatDate(article.created_at)}
          </time>
        </div>
      </Link>
    )
  }

  if (variant === 'compact') {
    return (
      <Link to={href} className="group block" style={style}>
        {article.image_url && (
          <img
            src={article.image_url}
            alt=""
            className="w-full aspect-video object-cover rounded-lg mb-2"
          />
        )}
        {category && (
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>
            {category.name}
          </span>
        )}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: 'var(--color-text)' }}>
          {title}
        </h3>
        <time className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {formatDate(article.created_at)}
        </time>
      </Link>
    )
  }

  // default
  return (
    <Link to={href} className="group block rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', ...style }}>
      {article.image_url && (
        <img
          src={article.image_url}
          alt=""
          className="w-full aspect-video object-cover"
        />
      )}
      <div className="p-4">
        {category && (
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>
            {category.name}
          </span>
        )}
        <h3 className="mt-1 text-base font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: 'var(--color-text)' }}>
          {title}
        </h3>
        <p className="mt-1 text-sm line-clamp-2" style={{ color: 'var(--color-muted)' }}>
          {excerpt(article.body)}
        </p>
        <time className="block mt-2 text-xs" style={{ color: 'var(--color-muted)' }}>
          {formatDate(article.created_at)}
        </time>
      </div>
    </Link>
  )
}
