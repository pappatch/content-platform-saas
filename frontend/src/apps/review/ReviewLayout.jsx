import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useDirection } from '../../hooks/useDirection'
import AlertControls from '../../components/AlertControls'

const NAV_SECTIONS = [
  {
    label: 'Review',
    items: [
      { to: '/review', label: 'Pending Queue ✅', end: true },
      { to: '/cms/articles?status=published', label: 'Published 📰', external: true },
      { to: '/cms/articles?status=removed', label: 'Removed 🗑️', external: true },
    ],
  },
]

const navLinkClass = ({ isActive }) =>
  `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-amber-700 text-white'
      : 'text-amber-200 hover:bg-amber-800 hover:text-white'
  }`

const externalLinkClass =
  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors text-amber-200 hover:bg-amber-800 hover:text-white'

export default function ReviewLayout() {
  const { user, logout } = useAuth()
  const { isRtl, toggle } = useDirection()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 shrink-0 bg-amber-900 text-white flex flex-col">
        <div className="px-4 py-5 text-lg font-bold tracking-wide border-b border-amber-700">
          Review
        </div>
        <nav className="flex-1 px-2 py-4 space-y-4">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map(({ to, label: itemLabel, end, external }) =>
                  external ? (
                    <Link key={to + itemLabel} to={to} className={externalLinkClass}>
                      {itemLabel}
                    </Link>
                  ) : (
                    <NavLink key={to + itemLabel} to={to} end={end} className={navLinkClass}>
                      {itemLabel}
                    </NavLink>
                  )
                )}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-amber-700 space-y-1">
          <p className="text-xs text-amber-500 uppercase tracking-wider mb-1">Switch to</p>
          <Link to="/admin" className="block text-xs text-amber-300 hover:text-white py-0.5">Admin →</Link>
          <Link to="/cms" className="block text-xs text-amber-300 hover:text-white py-0.5">CMS →</Link>
        </div>
        <div className="px-4 py-4 border-t border-amber-700 space-y-2">
          <button
            onClick={toggle}
            className="w-full text-left text-xs text-amber-300 hover:text-white"
          >
            {isRtl ? 'Switch to LTR' : 'Switch to RTL'}
          </button>
          <div className="text-xs text-amber-400 truncate">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-amber-300 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 px-6 py-3 border-b bg-white border-gray-200">
          <span className="text-sm font-semibold text-gray-900">Review</span>
          <AlertControls />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
