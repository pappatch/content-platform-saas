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
 *   The result (including the fallback 'light') is immediately committed to
 *   localStorage so the preference survives remounts and HMR without re-fetching.
 *
 * DOM effect
 * ----------
 *   When isDark is true, the 'dark' class is added to <html>.
 *   Tailwind's class-based dark mode strategy picks this up automatically,
 *   so all dark: variants in any component work without extra wiring.
 *   The class is also applied synchronously in the state initializer to
 *   avoid a flash of the wrong theme before effects run.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/client'

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {}, setTheme: () => {} })

const STORAGE_KEY = 'admin_theme'

function applyThemeClass(dark) {
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const dark = stored === 'dark'
    // Apply immediately (synchronous) so the correct class is on <html>
    // before the first paint — prevents a flash of the wrong theme.
    applyThemeClass(dark)
    return dark
  })

  // On first visit (no localStorage value), fetch the platform default.
  // Always commit the result to localStorage so remounts don't re-fetch.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      api.get('/settings')
        .then(r => {
          const setting = r.data.find(s => s.key === 'admin_theme_default')
          const dark = setting?.value === 'dark'
          localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
          setIsDark(dark)
        })
        .catch(() => {
          // Backend not ready yet — commit 'light' so we don't keep re-fetching.
          localStorage.setItem(STORAGE_KEY, 'light')
        })
    }
  }, [])

  // Always keep the DOM class and localStorage in sync with isDark state.
  // This is the canonical sync point — it runs whenever isDark changes,
  // including changes triggered by toggleTheme or the API default fetch.
  useEffect(() => {
    applyThemeClass(isDark)
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  function toggleTheme() {
    setIsDark(prev => !prev)
  }

  // Direct setter — used by Settings page to apply a new theme value immediately
  // without having to know the current state.
  function setTheme(value) {
    setIsDark(value === 'dark')
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
