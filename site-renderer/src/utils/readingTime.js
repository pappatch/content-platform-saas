/**
 * readingTime — estimate the reading time for an HTML article.
 *
 * Strips all HTML tags, normalises whitespace, counts words, and divides
 * by the average adult reading speed of 200 words per minute.
 *
 * @param {string|null|undefined} contentHtml - Raw HTML string from the API.
 * @returns {number} Estimated reading time in minutes (minimum 1).
 */
export function readingTime(contentHtml) {
  if (!contentHtml) return 1
  const text = contentHtml
    .replace(/<[^>]+>/g, ' ')   // strip tags
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim()
  const words = text ? text.split(' ').filter(w => w.length > 0).length : 0
  return Math.max(1, Math.round(words / 200))
}
