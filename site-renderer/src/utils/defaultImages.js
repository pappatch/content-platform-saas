/**
 * Default image fallback system.
 *
 * Returns a URL from the admin-curated storedImages list, or null if none are
 * available.  Callers are responsible for rendering a colour placeholder when
 * this function returns null (e.g. ArticleCard uses site primary-colour).
 *
 * Hardcoded Unsplash redirects were removed — they surfaced mismatched photos
 * (shih-tzu articles showing architecture images, etc.) and masked the absence
 * of properly curated default images for a site.
 */

/**
 * Return a default image URL for a given article, or null if no stored images
 * are available.
 *
 * @param {string[]|null}  _keywords     - Unused; kept for call-site compatibility
 * @param {number}         index         - Article ID; cycles through storedImages deterministically
 * @param {string[]|null}  storedImages  - Admin-curated URLs from site.config.default_images
 * @returns {string|null}
 */
export function getDefaultImage(_keywords, index = 0, storedImages = null) {
  if (Array.isArray(storedImages) && storedImages.length > 0) {
    const i = Math.abs(index || 0)
    const url = storedImages[i % storedImages.length]
    if (url) return url
  }
  return null
}
