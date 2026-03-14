import { Link } from 'react-router-dom'

/**
 * Renders a site logo thumbnail (when available) beside the site name.
 * Wraps both in a <Link to="/">.
 *
 * Props:
 *   site          — the site object from SiteContext
 *   linkClassName — extra classes on the <Link> wrapper
 *   nameClassName — classes for the site name <span>
 *   nameStyle     — inline style for the site name <span> (e.g. { color: 'var(--color-primary)' })
 */
export default function SiteBrand({ site, linkClassName = '', nameClassName = '', nameStyle }) {
  const logoUrl = site?.config?.logo_url

  return (
    <Link to="/" className={`inline-flex items-center gap-2 shrink-0 ${linkClassName}`}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          style={{ width: 'auto', maxWidth: '240px', height: '60px', objectFit: 'contain' }}
        />
      )}
      <span className={nameClassName} style={nameStyle}>{site?.name}</span>
    </Link>
  )
}
