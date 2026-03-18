import api from '../api/client'

export const getArticles = (params = {}) =>
  api.get('/cms/articles', { params }).then((r) => r.data)

export const getArticle = (id) =>
  api.get(`/cms/articles/${id}`).then((r) => r.data)

export const getArticleStats = (params = {}) =>
  api.get('/cms/articles/stats', { params }).then((r) => r.data)

export const updateArticle = (id, data) =>
  api.patch(`/cms/articles/${id}`, data).then((r) => r.data)

export const removeArticle = (id) =>
  api.delete(`/cms/articles/${id}`)

export const bulkUpdateArticles = (ids, action, category_id = null) =>
  api.patch('/cms/articles/bulk', { ids, action, ...(category_id != null && { category_id }) }).then((r) => r.data)
