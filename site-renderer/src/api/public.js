import api from './client'

export const getSite = (siteId) =>
  api.get(`/sites/${siteId}`).then((r) => r.data)

export const getArticles = (siteId, params = {}) =>
  api.get(`/sites/${siteId}/articles`, { params }).then((r) => r.data)

export const getArticle = (articleId) =>
  api.get(`/articles/${articleId}`).then((r) => r.data)

export const getCategories = (siteId) =>
  api.get(`/sites/${siteId}/categories`).then((r) => r.data)
