import { Routes, Route } from 'react-router-dom'
import { useSite } from './contexts/SiteContext'
import TemplateRouter from './templates/TemplateRouter'
import ArticlePage from './pages/ArticlePage'
import CategoryPage from './pages/CategoryPage'
import NotFound from './pages/NotFound'

const SITE_ID = import.meta.env.VITE_SITE_ID

function SiteNotConfigured() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <p className="text-5xl font-bold text-gray-200 mb-4">⚙</p>
      <h1 className="text-xl font-semibold text-gray-700">Site not configured</h1>
      <p className="mt-2 text-gray-500 text-sm">
        Set <code className="bg-gray-100 px-1 rounded">VITE_SITE_ID</code> in your <code className="bg-gray-100 px-1 rounded">.env</code> file and restart the dev server.
      </p>
    </div>
  )
}

function LoadError({ message }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <p className="text-5xl font-bold text-red-200 mb-4">!</p>
      <h1 className="text-xl font-semibold text-gray-700">Could not load site</h1>
      <p className="mt-2 text-gray-500 text-sm">{message || 'Check that the backend is running and the site ID is correct.'}</p>
    </div>
  )
}

function Loading({ theme }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)', ...theme }}>
      <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-gray-700 animate-spin" />
    </div>
  )
}

function SiteRoutes() {
  const { site, articles, categories, categoryMap, theme, isLoading, isError, error } = useSite()

  if (!SITE_ID) return <SiteNotConfigured />
  if (isLoading) return <Loading theme={theme} />
  if (isError) return <LoadError message={error?.response?.data?.detail} />

  const commonProps = { site, articles, categories, categoryMap, theme }

  return (
    <Routes>
      <Route path="/" element={<TemplateRouter {...commonProps} />} />
      <Route path="/article/:id" element={<ArticlePage />} />
      <Route path="/category/:slug" element={<CategoryPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return <SiteRoutes />
}
