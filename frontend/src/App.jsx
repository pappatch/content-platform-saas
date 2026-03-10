import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'

import AdminLayout from './apps/admin/AdminLayout'
import AdminDashboard from './apps/admin/Dashboard'
import AdminSites from './apps/admin/Sites'
import AdminScrapeJobs from './apps/admin/ScrapeJobs'
import AdminUsers from './apps/admin/Users'

import CmsLayout from './apps/cms/CmsLayout'
import CmsDashboard from './apps/cms/Dashboard'

import ReviewLayout from './apps/review/ReviewLayout'
import ReviewDashboard from './apps/review/Dashboard'

export default function App() {
  return (
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
        {/* Future: articles, categories routes */}
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
  )
}
