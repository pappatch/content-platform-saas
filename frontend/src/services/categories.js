import api from '../api/client'

export const getCategories = (params = {}) =>
  api.get('/cms/categories', { params }).then((r) => r.data)

export const createCategory = (data) =>
  api.post('/cms/categories', data).then((r) => r.data)

export const updateCategory = (id, data) =>
  api.patch(`/cms/categories/${id}`, data).then((r) => r.data)

export const deleteCategory = (id) =>
  api.delete(`/cms/categories/${id}`)
