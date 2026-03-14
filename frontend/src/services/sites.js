import api from '../api/client'

export const getSites = (showAll = false) =>
  api.get('/sites', { params: showAll ? { show_all: true } : {} }).then((r) => r.data)

export const getSiteStats = () =>
  api.get('/sites/stats').then((r) => r.data)

export const previewSiteConfig = (name, language, keywords = []) =>
  api.post('/sites/ai-preview', { name, language, keywords }).then((r) => r.data)

export const createSite = (data) => api.post('/sites', data).then((r) => r.data)
export const updateSite = (id, data) => api.patch(`/sites/${id}`, data).then((r) => r.data)
export const deleteSite = (id) => api.delete(`/sites/${id}`)

/** Call Claude to fill missing tagline/about/default_category_names for an existing site. */
export const enrichSite = (id) => api.post(`/sites/${id}/ai-enrich`).then((r) => r.data)

/** Fetch (and persist) 5 curated Unsplash images for the site's keyword set. */
export const getSiteDefaultImages = (id) =>
  api.get(`/sites/${id}/default-images`).then((r) => r.data)

/** Run the image audit on all published articles. */
export const auditImages = (fix = true, limit = 200) =>
  api.post('/admin/images/audit', null, { params: { fix, limit } }).then((r) => r.data)
