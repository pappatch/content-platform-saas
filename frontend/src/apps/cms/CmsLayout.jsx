import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useDirection } from '../../hooks/useDirection'

const NAV_SECTIONS = [
  {
    label: 'Content',
    items: [
      { to: '/cms/articles', label: 'Articles ✍️' },
      { to: '/cms/categories', label: 'Categories 🏷️' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/cms/articles', label: 'Pin Management 📌', external: true },
      { to: '/review', label: 'Review Queue ✅', external: true },
    ],
  },
]

const navLinkClass = ({ isActive }) =>
  `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-emerald-700 text-white'
      : 'text-emerald-200 hover:bg-emerald-800 hover:text-white'
  }`

const externalLinkClass =
  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors text-emerald-200 hover:bg-emerald-800 hover:text-white'

export default function CmsLayout() {
  const { user, logout } = useAuth()
  const { isRtl, toggle } = useDirection()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 shrink-0 bg-emerald-900 text-white flex flex-col">
        <div className="px-4 py-5 text-lg font-bold tracking-wide border-b border-emerald-700">
          CMS
        </div>
        <nav className="flex-1 px-2 py-4 space-y-4">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-500">
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
        <div className="px-4 py-3 border-t border-emerald-700 space-y-1">
          <p className="text-xs text-emerald-500 uppercase tracking-wider mb-1">Switch to</p>
          <Link to="/admin" className="block text-xs text-emerald-300 hover:text-white py-0.5">Admin →</Link>
        </div>
        <div className="px-4 py-4 border-t border-emerald-700 space-y-2">
          <button
            onClick={toggle}
            className="w-full text-left text-xs text-emerald-300 hover:text-white"
          >
            {isRtl ? 'Switch to LTR' : 'Switch to RTL'}
          </button>
          <div className="text-xs text-emerald-400 truncate">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-emerald-300 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
