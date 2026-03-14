/**
 * Footer — standalone site footer.
 *
 * Used by ArticleDetail (and any page that doesn't go through TemplateB's
 * SiteFooter). Reads all data it needs from SiteContext so callers don't
 * need to pass props.
 *
 * Content columns:
 *  1. About — site.config.about, or tagline fallback, or keyword-built fallback
 *  2. Topics — real category links (or AI-suggested names if none loaded yet)
 *  3. Copyright + "Powered by"
 */

import { Link } from 'react-router-dom'
import { useSite } from '../contexts/SiteContext'

function buildAboutFallback(name, tagline, keywords) {
  if (tagline) return `${name} — ${tagline}`
  if (keywords && keywords.length >= 3) {
    return `${name} covers the latest in ${keywords[0]}, ${keywords[1]}, and ${keywords[2]}. Fresh stories published daily.`
  }
  return `${name}: the latest news and stories.`
}

export default function Footer() {
  const { site, categories, siteKeywords } = useSite()

  const name = site?.name || ''
  const about = site?.config?.about
  const tagline = site?.config?.tagline
  const suggestedCats = site?.config?.default_category_names || []

  const aboutText = about || buildAboutFallback(name, tagline, siteKeywords)

  return (
    <footer style={{ borderTop: '3px solid var(--color-primary)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* About */}
          <div>
            <Link
              to="/"
              className="font-black text-2xl mb-3 block hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-text)' }}
            >
              {name}
            </Link>
            {tagline && (
              <p className="text-sm font-medium mb-2 italic" style={{ color: 'var(--color-secondary)' }}>
                {tagline}
              </p>
            )}
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              {aboutText}
            </p>
          </div>

          {/* Topics */}
          <div>
            <h4
              className="font-bold text-xs uppercase tracking-widest mb-4"
              style={{ color: 'var(--color-muted)' }}
            >
              Topics
            </h4>
            {categories.length > 0 ? (
              <ul className="space-y-2.5">
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <Link
                      to={`/category/${cat.slug}`}
                      className="text-sm hover:underline transition-opacity hover:opacity-80"
                      style={{ color: 'var(--color-secondary)' }}
                    >
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : suggestedCats.length > 0 ? (
              <ul className="space-y-2.5">
                {suggestedCats.map((catName) => (
                  <li key={catName} className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {catName}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Copyright */}
          <div className="md:text-right flex flex-col justify-between">
            <div />
            <div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                © {new Date().getFullYear()} {name}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted)', opacity: 0.5 }}>
                Powered by ContentPlatform
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
