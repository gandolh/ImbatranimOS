import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
  // Send the httpOnly session cookie on every request (required cross-origin
  // in dev: Vite :5173 -> API :3001; harmless same-origin in prod).
  withCredentials: true,
})

// When a protected route rejects with 401 the session has expired or was
// revoked — signal the app to drop back to the lock screen. Auth endpoints
// (login failures etc.) are excluded; those are handled locally by the caller.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = String(err?.config?.url ?? '')
    if (err?.response?.status === 401 && !url.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    return Promise.reject(err)
  },
)
