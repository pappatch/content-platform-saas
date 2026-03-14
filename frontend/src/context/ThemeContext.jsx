/**
 * ThemeContext — dark / light mode for the admin panel.
 *
 * Usage
 * -----
 *   const { isDark, toggleTheme } = useTheme()
 *
 * Persistence
 * -----------
 *   The user's choice is stored in localStorage under the key 'admin_theme'.
 *   On first visit (no localStorage value), the component attempts to load the
 *   platform-wide default from GET /settings (admin_theme_default = 'light' | 'dark').
 *   If the request fails (user not yet authenticated, backend down) it silently
 *   falls back to 'light'.
 *
 * DOM effect
 * ----------
 *   When isDark is true, the 'dark' class is added to <html>.
 *   Tailwind's class-based dark mode strategy picks this up automatically,
 *   so all dark: variants in any component work without extra wiring.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/client'

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {} })

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('admin_theme')
    if (stored) return stored === 'dark'
    return false // will be replaced by platform default on first mount
  })

  // On first mount with no localStorage value, fetch the platform default.
  useEffect(() => {
    const stored = localStorage.getItem('admin_theme')
    if (!stored) {
      api.get('/settings')
        .then(r => {
          const setting = r.data.find(s => s.key === 'admin_theme_default')
          if (setting?.value === 'dark') {
            setIsDark(true)
          }
        })
        .catch(() => {}) // ignore — backend may not be ready yet
    }
  }, [])

  // Apply / remove the 'dark' class on <html> whenever isDark changes.
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  function toggleTheme() {
    setIsDark(prev => {
      const next = !prev
      localStorage.setItem('admin_theme', next ? 'dark' : 'light')
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
