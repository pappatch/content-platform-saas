import api from '../api/client'

export const getSites = (showAll = false) =>
  api.get('/sites', { params: showAll ? { show_all: true } : {} }).then((r) => r.data)

export const createSite = (data) => api.post('/sites', data).then((r) => r.data)
export const updateSite = (id, data) => api.patch(`/sites/${id}`, data).then((r) => r.data)
export const deleteSite = (id) => api.delete(`/sites/${id}`)
