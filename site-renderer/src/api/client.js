import axios from 'axios'

const api = axios.create({
  baseURL: '/public',
  headers: { 'Content-Type': 'application/json' },
})

export default api
