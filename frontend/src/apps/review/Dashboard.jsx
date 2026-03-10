import { useAuth } from '../../hooks/useAuth'

export default function ReviewDashboard() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Review Queue</h1>
      <p className="text-gray-500 mb-6">Logged in as {user?.email}</p>

      <div className="card">
        <p className="text-gray-500 text-sm">
          No articles pending review. Check back later.
        </p>
      </div>
    </div>
  )
}
