import { useAuth } from '../../hooks/useAuth'

export default function CmsDashboard() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">CMS Dashboard</h1>
      <p className="text-gray-500 mb-6">Welcome back, {user?.email}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Published', value: '—' },
          { label: 'Drafts', value: '—' },
          { label: 'Pending Review', value: '—' },
          { label: 'Categories', value: '—' },
          { label: 'Sites', value: '—' },
          { label: 'Removed', value: '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
