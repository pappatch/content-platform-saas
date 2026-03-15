import { Link } from 'react-router-dom'
import { useSite } from '../contexts/SiteContext'
import { getDefaultImage } from '../utils/defaultImages'

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Extract a short excerpt from an article.
 * Uses seo_description if available (always present in list responses);
 * otherwise strips HTML from content_html (detail responses only).
 */
export function excerpt(articleOrText, length = 120) {
  let text = ''
  if (typeof articleOrText === 'string') {
    text = articleOrText
  } else if (articleOrText) {
    text = articleOrText.seo_description || ''
    if (!text && articleOrText.content_html) {
      text = articleOrText.content_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    }
  }
  const flat = text.replace(/\n+/g, ' ').trim()
  return flat.length > length ? flat.slice(0, length).trimEnd() + '…' : flat
}

/** Decode the JWT role claim from localStorage without an external library. */
function getAdminToken() {
  try {
    const raw = localStorage.getItem('token')
    if (!raw) return null
    const payload = JSON.parse(atob(raw.split('.')[1]))
    return payload.role === 'admin' ? payload : null
  } catch {
    return null
  }
}

/**
 * Render an image when src is non-null, or a branded colour-block placeholder.
 * className / style are applied to both the <img> and the placeholder <div>.
 */
function ArticleImage({ src, alt = '', className = '', placeholderStyle = {} }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        onError={(e) => {
          // On broken image, replace with placeholder div
          const div = document.createElement('div')
          div.className = e.target.className
          div.style.cssText = e.target.style.cssText
          Object.assign(div.style, placeholderStyle)
          e.target.parentNode.replaceChild(div, e.target)
        }}
      />
    )
  }
  return <div className={className} style={placeholderStyle} />
}

/**
 * Shared article card — templates compose or override as needed.
 * Variants: 'default' | 'compact' | 'list'
 */
export default function ArticleCard({ article, category, variant = 'default', style }) {
  const { siteKeywords, siteDefaultImages } = useSite()
  const isAdmin = Boolean(getAdminToken())
  const title = article.seo_title || article.title
  const href = `/article/${article.id}`
  const imgSrc = article.main_image_url || getDefaultImage(siteKeywords, article.id, siteDefaultImages)

  // Colour placeholder style — uses site primary colour at low opacity
  const placeholderStyle = {
    backgroundColor: 'var(--color-primary)',
    opacity: 0.15,
  }

  const readingTime = article.reading_time_minutes || 1

  if (variant === 'list') {
    return (
      <Link
        to={href}
        className="flex gap-4 py-3 border-b last:border-0 group"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <ArticleImage
          src={imgSrc}
          className="w-20 h-16 object-cover rounded shrink-0"
          placeholderStyle={{ ...placeholderStyle, width: '5rem', height: '4rem', borderRadius: '0.25rem', flexShrink: 0 }}
        />
        <div className="flex-1 min-w-0">
          {category && (
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>
              {category.name}
            </span>
          )}
          <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: 'var(--color-text)' }}>
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5" style={{ color: 'var(--color-muted)' }}>
            <time className="text-xs">{formatDate(article.created_at)}</time>
            <span className="text-xs">· {readingTime} min read</span>
          </div>
        </div>
      </Link>
    )
  }

  if (variant === 'compact') {
    return (
      <Link to={href} className="group block" style={style}>
        <ArticleImage
          src={imgSrc}
          className="w-full aspect-video object-cover rounded-lg mb-2"
          placeholderStyle={{ ...placeholderStyle, aspectRatio: '16/9', borderRadius: '0.5rem', marginBottom: '0.5rem' }}
        />
        {category && (
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>
            {category.name}
          </span>
        )}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: 'var(--color-text)' }}>
          {title}
        </h3>
        <div className="flex items-center gap-2 mt-0.5" style={{ color: 'var(--color-muted)' }}>
          <time className="text-xs">{formatDate(article.created_at)}</time>
          <span className="text-xs">· {readingTime} min read</span>
        </div>
      </Link>
    )
  }

  // default
  return (
    <div className="group block rounded-xl overflow-hidden relative" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', ...style }}>
      {isAdmin && (
        <a
          href={`http://localhost:5173/cms/articles/${article.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 z-10 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Edit
        </a>
      )}
      <Link to={href}>
        <ArticleImage
          src={imgSrc}
          className="w-full aspect-video object-cover"
          placeholderStyle={{ ...placeholderStyle, aspectRatio: '16/9', width: '100%' }}
        />
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
            {excerpt(article)}
          </p>
          <div className="flex items-center gap-2 mt-2" style={{ color: 'var(--color-muted)' }}>
            <time className="text-xs">{formatDate(article.created_at)}</time>
            <span className="text-xs">· {readingTime} min read</span>
          </div>
        </div>
      </Link>
    </div>
  )
}
