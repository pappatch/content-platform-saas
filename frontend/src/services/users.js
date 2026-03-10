import api from '../api/client'

export const getUsers = () => api.get('/admin/users').then((r) => r.data)
export const createUser = (data) => api.post('/auth/register', data).then((r) => r.data)
export const updateUser = (id, data) => api.patch(`/admin/users/${id}`, data).then((r) => r.data)
