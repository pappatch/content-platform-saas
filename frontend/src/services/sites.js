import api from '../api/client'

export const getSites = () => api.get('/sites').then((r) => r.data)
export const createSite = (data) => api.post('/sites', data).then((r) => r.data)
export const updateSite = (id, data) => api.patch(`/sites/${id}`, data).then((r) => r.data)
export const deleteSite = (id) => api.delete(`/sites/${id}`)
