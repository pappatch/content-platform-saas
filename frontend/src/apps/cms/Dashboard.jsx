import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../hooks/useAuth'
import { getArticleStats, getArticles } from '../../services/articles'
import { getSites } from '../../services/sites'
import Spinner from '../../components/Spinner'
import AiScoreBadge from '../../components/AiScoreBadge'
import StatusBadge from '../../components/StatusBadge'

const STAT_CARDS = [
  { label: 'Total Articles', key: 'total',     color: 'text-indigo-600' },
  { label: 'Published',      key: 'published', color: 'text-green-600'  },
  { label: 'Pending Review', key: 'pending',   color: 'text-yellow-600' },
  { label: 'Removed',        key: 'removed',   color: 'text-red-500'    },
]

export default function CmsDashboard() {
  const { user } = useAuth()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['article-stats'],
    queryFn: () => getArticleStats(),
  })

  const { data: recent = [] } = useQuery({
    queryKey: ['articles-recent'],
    queryFn: () => getArticles(),
    select: (data) => data.slice(0, 8),
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => getSites(true),
  })

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.name]))

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">CMS Dashboard</h1>
      <p className="text-gray-500 mb-6">Welcome back, {user?.email}</p>

      {statsLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {STAT_CARDS.map(({ label, key, color }) => (
            <div key={key} className="card">
              <div className="text-sm text-gray-500">{label}</div>
              <div className={`mt-1 text-3xl font-semibold ${color}`}>
                {stats?.[key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Recent Articles</h2>
          <Link to="/cms/articles" className="text-sm text-indigo-600 hover:underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No articles yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {recent.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 max-w-[280px]">
                    <Link
                      to={`/cms/articles/${a.id}`}
                      className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-1 block"
                    >
                      {a.title}
                    </Link>
                    <div className="text-xs text-gray-400">
                      {siteMap[a.site_id] ?? `Site #${a.site_id}`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <AiScoreBadge score={a.ai_score} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(a.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
