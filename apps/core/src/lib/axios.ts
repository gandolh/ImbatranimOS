import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
  // Send the httpOnly session cookie on every request (required cross-origin
  // in dev: Vite :5173 -> API :3001; harmless same-origin in prod).
  withCredentials: true,
})

/*
 * A 401 from a guarded route means the session ended (signed out elsewhere,
 * expired, or a password change ended it): signal the desktop to cover itself
 * with the sign-in screen. The sign-in's own routes are excluded: a wrong
 * password there is the form's business, not a lost session.
 *
 * `system.http` is this instance, so every add-on's request gets this too.
 */
api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    const config = (err as { config?: { url?: string } }).config
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 401 && !String(config?.url ?? '').startsWith('/identity/')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    return Promise.reject(err)
  }
)
