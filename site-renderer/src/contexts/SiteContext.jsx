import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSite, getArticles, getCategories } from '../api/public'

const SITE_ID = import.meta.env.VITE_SITE_ID

export const SiteContext = createContext(null)

function buildTheme(config = {}) {
  return {
    '--color-primary': config.primary_color || '#1a1a2e',
    '--color-secondary': config.secondary_color || '#e94560',
    '--color-bg': config.bg_color || '#ffffff',
    '--color-text': config.text_color || '#111827',
    '--color-muted': config.muted_color || '#6b7280',
    '--color-surface': config.surface_color || '#f9fafb',
    '--color-border': config.border_color || '#e5e7eb',
  }
}

export function SiteProvider({ children }) {
  const siteQuery = useQuery({
    queryKey: ['site', SITE_ID],
    queryFn: () => getSite(SITE_ID),
    enabled: Boolean(SITE_ID),
    retry: 2,
  })

  const articlesQuery = useQuery({
    queryKey: ['articles', SITE_ID],
    queryFn: () => getArticles(SITE_ID),
    enabled: Boolean(SITE_ID) && siteQuery.isSuccess,
    retry: 2,
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories', SITE_ID],
    queryFn: () => getCategories(SITE_ID),
    enabled: Boolean(SITE_ID) && siteQuery.isSuccess,
    retry: 2,
  })

  const categoryMap = useMemo(() => {
    const map = {}
    for (const cat of categoriesQuery.data || []) {
      map[cat.id] = cat
    }
    return map
  }, [categoriesQuery.data])

  const theme = useMemo(
    () => buildTheme(siteQuery.data?.config),
    [siteQuery.data]
  )

  const value = {
    siteId: SITE_ID,
    site: siteQuery.data || null,
    articles: articlesQuery.data || [],
    categories: categoriesQuery.data || [],
    categoryMap,
    theme,
    isLoading: siteQuery.isLoading || articlesQuery.isLoading || categoriesQuery.isLoading,
    isError: siteQuery.isError,
    error: siteQuery.error,
  }

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used within SiteProvider')
  return ctx
}
