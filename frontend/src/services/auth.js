import api from '../api/client'

export const loginRequest = (email, password) =>
  api.post('/auth/login', { email, password })

export const getMeRequest = () =>
  api.get('/auth/me')
