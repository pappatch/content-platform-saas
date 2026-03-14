import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSite, getArticles, getCategories } from '../api/public'
import { DEFAULT_KEYWORDS } from '../utils/defaultImages'

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

  // Build a site-specific keyword list for default image fallbacks.
  //
  // Priority:
  //   1. Scrape-job keywords from the API (most specific — these are the actual
  //      search terms used to find content for the site, e.g. ["bonsai tree",
  //      "Japanese art tree"]).  Comes from GET /public/sites/{id}.scrape_keywords
  //      which is populated server-side from the site's ScrapeJob rows.
  //   2. AI-generated category names (config.default_category_names)
  //   3. Loaded category names from DB
  //   4. Tagline significant words (length > 4)
  //   5. Generic DEFAULT_KEYWORDS as last-resort variety
  //
  // The scrape keywords are always placed first so `getDefaultImage(keywords, article.id)`
  // cycles through topic-specific terms before ever reaching generic fallbacks.
  const siteKeywords = useMemo(() => {
    const site = siteQuery.data
    if (!site) return DEFAULT_KEYWORDS

    const seen = new Set()
    const keywords = []

    function push(k) {
      const norm = k.toLowerCase().trim()
      if (norm && !seen.has(norm)) {
        seen.add(norm)
        keywords.push(norm)
      }
    }

    // 1. Scrape-job keywords (primary — topic-specific)
    for (const kw of site.scrape_keywords || []) push(kw)

    // 2. AI-generated category names
    for (const cn of site.config?.default_category_names || []) push(cn)

    // 3. Loaded categories
    for (const cat of categoriesQuery.data || []) push(cat.name)

    // 4. Tagline words (skip short stop-words)
    if (site.config?.tagline) {
      for (const word of site.config.tagline.split(/\s+/)) {
        if (word.length > 4) push(word)
      }
    }

    // 5. Generic fallbacks for variety
    for (const k of DEFAULT_KEYWORDS) push(k)

    return keywords
  }, [siteQuery.data, categoriesQuery.data])

  // Pre-curated Unsplash images stored in site.config.default_images (may be null/empty).
  // When present, ArticleCard uses these instead of keyword-based Unsplash redirects.
  const siteDefaultImages = useMemo(() => {
    const imgs = siteQuery.data?.config?.default_images
    return Array.isArray(imgs) && imgs.length > 0 ? imgs : null
  }, [siteQuery.data])

  const value = {
    siteId: SITE_ID,
    site: siteQuery.data || null,
    articles: articlesQuery.data || [],
    categories: categoriesQuery.data || [],
    categoryMap,
    theme,
    siteKeywords,
    siteDefaultImages,
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
