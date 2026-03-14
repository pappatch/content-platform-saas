/**
 * Default image fallback system.
 *
 * Three-tier fallback ensures getDefaultImage() ALWAYS returns a non-null URL:
 *
 *  Tier 1 — storedImages    : admin-curated URLs in site.config.default_images.
 *                             These were validated server-side (Unsplash API, HEAD check).
 *
 *  Tier 2 — keyword redirect : Unsplash featured-photo redirect built from the
 *                             site-specific keyword list in SiteContext.
 *
 *  Tier 3 — hardcoded URLs   : Five permanent Unsplash topic-redirect URLs that
 *                             always resolve to high-quality photographs.
 *                             Used only when both Tier 1 and Tier 2 are unavailable.
 */

// Generic fallback keywords used only when no site-specific keywords are available.
// SiteContext builds a richer keyword list from site name + categories + config.
export const DEFAULT_KEYWORDS = ['nature', 'landscape', 'city', 'people', 'travel']

/**
 * Last-resort hardcoded Unsplash redirects.
 * These use Unsplash's ``/featured/?{topic}`` pattern which always returns a
 * valid landscape photo regardless of site subject matter.
 */
export const HARDCODED_FALLBACKS = [
  'https://source.unsplash.com/featured/?architecture',
  'https://source.unsplash.com/featured/?photography',
  'https://source.unsplash.com/featured/?nature',
  'https://source.unsplash.com/featured/?cityscape',
  'https://source.unsplash.com/featured/?abstract',
]

/**
 * Return a default image URL for a given article.
 *
 * Always returns a non-null, non-undefined string.
 *
 * Priority:
 *  1. ``storedImages``   — pre-curated, server-validated URLs from site.config.default_images
 *  2. Keyword redirect   — Unsplash /featured/ URL built from the keywords array
 *  3. Hardcoded fallback — HARDCODED_FALLBACKS[index % 5] (last resort)
 *
 * @param {string[]|null}  keywords      - Site-specific keywords (falls back to DEFAULT_KEYWORDS)
 * @param {number}         index         - Article ID; used to cycle through lists deterministically
 * @param {string[]|null}  storedImages  - Admin-curated image URLs (site.config.default_images)
 * @returns {string}                     - A valid, non-null image URL
 */
export function getDefaultImage(keywords, index = 0, storedImages = null) {
  const i = Math.abs(index || 0)

  // Tier 1 — stored images
  if (Array.isArray(storedImages) && storedImages.length > 0) {
    const url = storedImages[i % storedImages.length]
    if (url) return url
  }

  // Tier 2 — keyword-based Unsplash redirect
  const kws = Array.isArray(keywords) && keywords.length > 0 ? keywords : DEFAULT_KEYWORDS
  const keyword = kws[i % kws.length]
  if (keyword) {
    return `https://source.unsplash.com/featured/?${encodeURIComponent(keyword)}`
  }

  // Tier 3 — hardcoded reliable fallback (never null)
  return HARDCODED_FALLBACKS[i % HARDCODED_FALLBACKS.length]
}
