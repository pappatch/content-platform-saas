/**
 * Default image fallback system.
 *
 * When an article has no main_image_url, or its URL is broken, we serve a
 * curated Unsplash photo keyed by keyword. The keyword is chosen by cycling
 * through the keywords array using the article ID as the index, so each
 * article consistently gets a different image without randomness.
 *
 * URL pattern: https://source.unsplash.com/featured/?{keyword}
 * Unsplash redirects this to a real photo matching the keyword.
 */

export const DEFAULT_KEYWORDS = ['shih tzu', 'dog', 'puppy', 'pet', 'cute dog']

/**
 * Return a default Unsplash image URL for a given article.
 *
 * @param {string[]} keywords  - Site-specific keyword list (falls back to DEFAULT_KEYWORDS)
 * @param {number}   index     - Article ID or any integer; used to cycle through keywords
 * @returns {string}           - Unsplash featured photo URL
 */
export function getDefaultImage(keywords, index = 0) {
  const kws = Array.isArray(keywords) && keywords.length > 0 ? keywords : DEFAULT_KEYWORDS
  const keyword = kws[Math.abs(index) % kws.length]
  return `https://source.unsplash.com/featured/?${encodeURIComponent(keyword)}`
}
