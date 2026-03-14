import axios from 'axios'

const TOKEN_KEY = 'auth_token'

/**
 * Axios client pre-configured for the Content Platform API.
 *
 * Base URL resolution order:
 *   1. VITE_API_URL env variable (set in frontend/.env or at build time)
 *   2. http://localhost:8000 as a dev fallback
 *
 * For production builds, set VITE_API_URL to the real API origin in your
 * CI/CD pipeline or .env.production file so the hardcoded localhost is
 * never used outside of local development.
 */
const api = axios.create({
  // SECURITY NOTE: do not hardcode a production URL here — use VITE_API_URL.
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401: clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      // Avoid redirect loop if already on /login
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export { TOKEN_KEY }
export default api
