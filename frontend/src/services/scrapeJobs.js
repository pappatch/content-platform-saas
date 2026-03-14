import api from '../api/client'

export const getJobs = (params = {}) =>
  api.get('/scraper/jobs', { params }).then((r) => r.data)

export const createJob = (data) => api.post('/scraper/jobs', data).then((r) => r.data)
export const updateJob = (id, data) => api.patch(`/scraper/jobs/${id}`, data).then((r) => r.data)
export const deleteJob = (id) => api.delete(`/scraper/jobs/${id}`)
export const runJob = (id) => api.post(`/scraper/jobs/${id}/run`).then((r) => r.data)
