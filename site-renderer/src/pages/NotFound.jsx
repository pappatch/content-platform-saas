import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <p className="text-7xl font-bold text-gray-200">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-gray-700">Page not found</h1>
      <p className="mt-2 text-gray-500">This article or page doesn't exist.</p>
      <Link to="/" className="mt-6 text-sm font-medium text-indigo-600 hover:underline">
        ← Go home
      </Link>
    </div>
  )
}
