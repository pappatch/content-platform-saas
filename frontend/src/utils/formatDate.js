/**
 * Format a date/datetime string for display in the admin UI.
 *
 * @param {string|null} iso  - ISO datetime string
 * @param {object} opts
 * @param {boolean} [opts.showTime=true]  - include HH:MM
 * @param {boolean} [opts.showYear=false] - include full year
 * @returns {string}
 */
export function formatDate(iso, { showTime = true, showYear = false } = {}) {
  if (!iso) return '—'
  try {
    const fmtOpts = { day: '2-digit', month: 'short' }
    if (showYear)  fmtOpts.year    = 'numeric'
    if (showTime) { fmtOpts.hour = '2-digit'; fmtOpts.minute = '2-digit' }
    return new Date(iso).toLocaleString('en-GB', fmtOpts)
  } catch {
    return iso
  }
}
