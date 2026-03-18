import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useDirection } from '../../hooks/useDirection'
import { useTheme } from '../../context/ThemeContext'
import AlertControls from '../../components/AlertControls'

const NAV_SECTIONS = [
  {
    label: 'Platform',
    items: [
      { to: '/admin', label: 'Dashboard', end: true },
      { to: '/admin/api-usage', label: 'API Costs 💰' },
    ],
  },
  {
    label: 'Content Pipeline',
    items: [
      { to: '/admin/trends', label: 'Trends 🔥' },
      { to: '/admin/sites', label: 'Sites 🌐' },
      { to: '/admin/scrape-jobs', label: 'Scrape Jobs 🔍' },
      { to: '/cms/articles', label: 'Articles ✍️', external: true },
      { to: '/review', label: 'Review Queue ✅', external: true },
    ],
  },
  {
    label: 'Publishing',
    items: [
      { to: '/cms/categories', label: 'Categories 🏷️', external: true },
      { to: '/admin/sites', label: 'Pin Management 📌' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/users', label: 'Users 👥' },
      { to: '/admin/architecture', label: 'Architecture 🏗️' },
      { to: '/admin/settings', label: 'Settings ⚙️' },
    ],
  },
]

const navLinkClass = ({ isActive }) =>
  `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-700 text-white'
      : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
  }`

const externalLinkClass = 'block px-3 py-2 rounded-lg text-sm font-medium transition-colors text-indigo-200 hover:bg-indigo-800 hover:text-white'

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { isRtl, toggle } = useDirection()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-indigo-900 text-white flex flex-col">
        <div className="px-4 py-5 flex items-center gap-2 border-b border-indigo-700">
          <span className="text-lg font-bold tracking-wide">Admin</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-4">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
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
        <div className="px-4 py-4 border-t border-indigo-700 space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full text-left text-xs text-indigo-300 hover:text-white"
          >
            {isDark ? '☀ Light mode' : '☾ Dark mode'}
          </button>
          <button
            onClick={toggle}
            className="w-full text-left text-xs text-indigo-300 hover:text-white"
          >
            {isRtl ? 'Switch to LTR' : 'Switch to RTL'}
          </button>
          <div className="text-xs text-indigo-400 truncate">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-indigo-300 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className={`flex items-center gap-2 px-6 py-3 border-b ${
          isDark ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
        }`}>
          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Admin
          </span>
          <AlertControls />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
