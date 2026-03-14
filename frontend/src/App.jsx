import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import { ThemeProvider } from './context/ThemeContext'

import AdminLayout from './apps/admin/AdminLayout'
import AdminDashboard from './apps/admin/Dashboard'
import AdminSites from './apps/admin/Sites'
import AdminScrapeJobs from './apps/admin/ScrapeJobs'
import AdminUsers from './apps/admin/Users'
import AdminTrends from './apps/admin/Trends'
import AdminArchitecture from './apps/admin/Architecture'
import AdminSettings from './apps/admin/Settings'

import CmsLayout from './apps/cms/CmsLayout'
import CmsDashboard from './apps/cms/Dashboard'
import CmsArticles from './apps/cms/Articles'
import CmsArticleDetail from './apps/cms/ArticleDetail'
import CmsCategories from './apps/cms/Categories'

import ReviewLayout from './apps/review/ReviewLayout'
import ReviewDashboard from './apps/review/Dashboard'

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Admin app — admin role only */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="sites" element={<AdminSites />} />
        <Route path="scrape-jobs" element={<AdminScrapeJobs />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="trends" element={<AdminTrends />} />
        <Route path="architecture" element={<AdminArchitecture />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* CMS app — editor or admin */}
      <Route
        path="/cms"
        element={
          <ProtectedRoute requiredRole="editor">
            <CmsLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CmsDashboard />} />
        <Route path="articles" element={<CmsArticles />} />
        <Route path="articles/:id" element={<CmsArticleDetail />} />
        <Route path="categories" element={<CmsCategories />} />
      </Route>

      {/* Review app — any authenticated user */}
      <Route
        path="/review"
        element={
          <ProtectedRoute>
            <ReviewLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ReviewDashboard />} />
        {/* Future: history route */}
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
    </ThemeProvider>
  )
}
