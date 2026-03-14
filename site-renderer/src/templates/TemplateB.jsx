/**
 * Template B — Premium Magazine
 *
 * Features
 * --------
 *  Sticky header      site name + category nav; transitions from transparent to
 *                     solid on scroll.
 *  Hero               ≥70vh full-width image, heavy gradient overlay, site tagline,
 *                     featured article title + excerpt + reading time.
 *                     If the hero article has an active pinned_until, a live
 *                     countdown badge is shown ("Featured for X more days").
 *  Spotlight row      2 large image cards — "Editor's Picks".
 *  3-column grid      Remaining articles with reading time, excerpt, and category.
 *  Footer             Site name, about text (from site.config.about), category links,
 *                     "Powered by" note.
 *
 * Props (provided by the template router in index.jsx)
 * ------
 *  site         SiteResponse object
 *  articles     Sorted list of published ArticleListResponse objects
 *  categories   CategoryResponse[]
 *  categoryMap  { [id]: CategoryResponse }
 *  theme        CSS-var object from SiteContext
 *  pageTitle    Active category name (string) or null for the home page
 *  headerExtra  Optional JSX node (e.g. language selector) from the router
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, excerpt } from '../components/ArticleCard'
import { useSite } from '../contexts/SiteContext'
import { getDefaultImage } from '../utils/defaultImages'
import InfiniteFeed from '../components/InfiniteFeed'
import Footer from '../components/Footer'

// ---------------------------------------------------------------------------
// Pinned countdown
// ---------------------------------------------------------------------------

function _remainingLabel(pinnedUntil) {
  if (!pinnedUntil) return null
  const diff = new Date(pinnedUntil) - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  if (days > 1) return `Featured for ${days} more days`
  if (days === 1) return `Featured for 1 more day`
  if (hours > 1) return `Featured for ${hours} more hours`
  return 'Featured · ending soon'
}

/**
 * Live countdown badge for timed-featured articles.
 * Updates every minute so the label stays accurate.
 */
function PinnedCountdown({ pinnedUntil }) {
  const [label, setLabel] = useState(() => _remainingLabel(pinnedUntil))

  useEffect(() => {
    if (!pinnedUntil) return
    const id = setInterval(() => setLabel(_remainingLabel(pinnedUntil)), 60_000)
    return () => clearInterval(id)
  }, [pinnedUntil])

  if (!label) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: 'var(--color-secondary)' }}
    >
      ⭐ {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sticky header
// ---------------------------------------------------------------------------

/**
 * Sticky header that transitions from a subtle transparent band to a solid
 * primary-colour bar after the user scrolls 100px.
 */
function StickyHeader({ site, categories, pageTitle, headerExtra }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'shadow-lg' : ''}`}
      style={{ backgroundColor: 'var(--color-primary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Top row: site name + extras */}
        <div className="flex items-center justify-between py-3 border-b border-white/10">
          <Link to="/" className="text-white font-black text-xl tracking-tight shrink-0">
            {site?.name}
          </Link>
          {headerExtra && <div className="flex items-center">{headerExtra}</div>}
        </div>

        {/* Category nav strip */}
        <nav
          className="flex items-center gap-1 overflow-x-auto py-2"
          style={{ scrollbarWidth: 'none' }}
          aria-label="Categories"
        >
          <Link
            to="/"
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
              !pageTitle
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            All
          </Link>
          {categories.map(cat => (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                pageTitle === cat.name
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {cat.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero section
// ---------------------------------------------------------------------------

/**
 * Full-width hero with the first article. Shows site tagline in the top-left
 * and the article title + excerpt + meta at the bottom with a deep gradient.
 */
function HeroSection({ article, categoryMap, site, siteKeywords }) {
  if (!article) return null

  const imgSrc = article.main_image_url || getDefaultImage(siteKeywords, article.id)
  const fallback = getDefaultImage(siteKeywords, article.id)
  const cat = categoryMap[article.category_id]
  const tagline = site?.config?.tagline

  return (
    <section className="relative flex items-end overflow-hidden h-40 md:h-56">
      {/* Background image */}
      <img
        src={imgSrc}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={e => { if (e.currentTarget.src !== fallback) { e.currentTarget.onerror = null; e.currentTarget.src = fallback } }}
      />

      {/* Gradient: dark at bottom, fades to transparent at top */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.10) 100%)' }}
      />

      {/* Site tagline — top left */}
      {tagline && (
        <div className="absolute top-0 left-0 right-0 px-6 md:px-10 pt-5">
          <div className="max-w-7xl mx-auto">
            <p className="text-white/50 text-xs font-medium tracking-widest uppercase">{tagline}</p>
          </div>
        </div>
      )}

      {/* Article info — bottom */}
      <div className="relative w-full px-6 md:px-10 pb-10 pt-6">
        <div className="max-w-7xl mx-auto">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {cat && (
              <Link
                to={`/category/${cat.slug}`}
                className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--color-secondary)', color: '#fff' }}
              >
                {cat.name}
              </Link>
            )}
            <PinnedCountdown pinnedUntil={article.pinned_until} />
          </div>

          {/* Title */}
          <Link to={`/article/${article.id}`} className="group block">
            <h1 className="text-4xl md:text-6xl font-black text-white leading-tight group-hover:opacity-90 transition-opacity max-w-4xl">
              {article.seo_title || article.title}
            </h1>
          </Link>

          {/* Excerpt */}
          <p className="mt-4 text-white/70 text-lg max-w-3xl leading-relaxed line-clamp-2">
            {excerpt(article, 200)}
          </p>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-white/45 text-sm">
            <time>{formatDate(article.created_at)}</time>
            {article.reading_time_minutes > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{article.reading_time_minutes} min read</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Spotlight (2-up large cards)
// ---------------------------------------------------------------------------

function SpotlightRow({ articles, categoryMap, siteKeywords }) {
  if (!articles.length) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
      {articles.map(article => {
        const imgSrc = article.main_image_url || getDefaultImage(siteKeywords, article.id)
        const fallback = getDefaultImage(siteKeywords, article.id)
        const cat = categoryMap[article.category_id]

        return (
          <Link
            key={article.id}
            to={`/article/${article.id}`}
            className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-shadow block"
            style={{ minHeight: '17rem' }}
          >
            <img
              src={imgSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              onError={e => { if (e.currentTarget.src !== fallback) { e.currentTarget.onerror = null; e.currentTarget.src = fallback } }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 55%)' }}
            />
            {/* Pin badge */}
            {article.pinned_until && new Date(article.pinned_until) > Date.now() && (
              <div className="absolute top-3 left-3">
                <span
                  className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-secondary)' }}
                >
                  Featured
                </span>
              </div>
            )}
            <div className="absolute bottom-0 p-5">
              {cat && (
                <span
                  className="text-xs font-bold uppercase tracking-widest mb-1 block"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  {cat.name}
                </span>
              )}
              <h3 className="text-white font-bold text-xl leading-snug line-clamp-2 group-hover:underline">
                {article.seo_title || article.title}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-white/50 text-xs">
                <time>{formatDate(article.created_at)}</time>
                {article.reading_time_minutes > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{article.reading_time_minutes} min read</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid card (More Stories section)
// ---------------------------------------------------------------------------

function GridCard({ article, categoryMap, siteKeywords }) {
  const imgSrc = article.main_image_url || getDefaultImage(siteKeywords, article.id)
  const fallback = getDefaultImage(siteKeywords, article.id)
  const cat = categoryMap[article.category_id]

  return (
    <Link
      to={`/article/${article.id}`}
      className="group flex flex-col rounded-2xl overflow-hidden transition-all hover:shadow-md"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Image */}
      <div className="relative overflow-hidden aspect-video">
        <img
          src={imgSrc}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={e => { if (e.currentTarget.src !== fallback) { e.currentTarget.onerror = null; e.currentTarget.src = fallback } }}
        />
        {article.pinned_until && new Date(article.pinned_until) > Date.now() && (
          <div className="absolute top-2 left-2">
            <span
              className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--color-secondary)' }}
            >
              Featured
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-5 flex flex-col">
        {cat && (
          <span
            className="text-xs font-bold uppercase tracking-wide mb-1.5"
            style={{ color: 'var(--color-secondary)' }}
          >
            {cat.name}
          </span>
        )}
        <h3
          className="font-bold text-base leading-snug line-clamp-2 group-hover:underline flex-1 mb-3"
          style={{ color: 'var(--color-text)' }}
        >
          {article.seo_title || article.title}
        </h3>
        <p className="text-sm line-clamp-2 mb-4 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          {excerpt(article, 120)}
        </p>
        <div className="flex items-center gap-2 text-xs mt-auto" style={{ color: 'var(--color-muted)' }}>
          <time>{formatDate(article.created_at)}</time>
          {article.reading_time_minutes > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{article.reading_time_minutes} min read</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * TemplateB — Premium Magazine layout.
 * Mounted by the template router for sites with template_id="template-b".
 */
export default function TemplateB({ site, articles, categories, categoryMap, theme, pageTitle, headerExtra }) {
  const dir = site?.text_direction || 'ltr'
  const { siteKeywords } = useSite()

  const hero      = articles[0] || null
  const spotlight = articles.slice(1, 3)
  const rest      = articles.slice(3)

  return (
    <div
      dir={dir}
      style={{ ...theme, backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      className="min-h-screen"
    >
      {/* Sticky header + category nav */}
      <StickyHeader
        site={site}
        categories={categories}
        pageTitle={pageTitle}
        headerExtra={headerExtra}
      />

      {/* Hero */}
      <HeroSection
        article={hero}
        categoryMap={categoryMap}
        site={site}
        siteKeywords={siteKeywords}
      />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">

        {/* Spotlight — Editor's Picks */}
        {spotlight.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-7">
              <div className="h-1 w-8 rounded-full" style={{ backgroundColor: 'var(--color-secondary)' }} />
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-muted)' }}
              >
                Editor's Picks
              </span>
            </div>
            <SpotlightRow
              articles={spotlight}
              categoryMap={categoryMap}
              siteKeywords={siteKeywords}
            />
          </>
        )}

        {/* More Stories — 3-column grid with infinite feed */}
        {rest.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-7">
              <div className="h-1 w-8 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-muted)' }}
              >
                More Stories
              </span>
            </div>
            <InfiniteFeed
              articles={rest}
              pageSize={9}
              gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              renderItem={(article) => (
                <GridCard
                  key={article.id}
                  article={article}
                  categoryMap={categoryMap}
                  siteKeywords={siteKeywords}
                />
              )}
            />
          </>
        )}

        {articles.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-lg" style={{ color: 'var(--color-muted)' }}>
              No articles published yet.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
