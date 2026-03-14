import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useDirection } from '../../hooks/useDirection'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/sites', label: 'Sites' },
  { to: '/admin/scrape-jobs', label: 'Scrape Jobs' },
  { to: '/admin/trends', label: 'Trends' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/architecture', label: 'Architecture' },
  { to: '/admin/settings', label: 'Settings ⚙️' },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { isRtl, toggle } = useDirection()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-indigo-900 text-white flex flex-col">
        <div className="px-4 py-5 text-lg font-bold tracking-wide border-b border-indigo-700">
          Admin
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-indigo-700 space-y-1">
          <p className="text-xs text-indigo-500 uppercase tracking-wider mb-1">Switch to</p>
          <Link to="/cms" className="block text-xs text-indigo-300 hover:text-white py-0.5">CMS →</Link>
          <Link to="/review" className="block text-xs text-indigo-300 hover:text-white py-0.5">Review →</Link>
        </div>
        <div className="px-4 py-4 border-t border-indigo-700 space-y-2">
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
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
