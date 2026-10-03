import axios, { type InternalAxiosRequestConfig } from 'axios'
import { refreshWardSession } from './wardSession'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
  // Send the httpOnly session cookie on every request (required cross-origin
  // in dev: Vite :5173 -> API :3001; harmless same-origin in prod).
  withCredentials: true,
})

/** Marks a request already replayed after a refresh, so it is never retried twice. */
type RetriableConfig = InternalAxiosRequestConfig & { wardRetried?: boolean }

const signalUnauthorized = () => window.dispatchEvent(new CustomEvent('auth:unauthorized'))

/*
 * A 401 is usually just the 15-minute access token expiring (brief 144). Refresh
 * the Ward session and replay the request once; only a dead refresh family, or a
 * request that fails again after a refresh, covers the desktop with the sign-in
 * screen. A refresh that cannot reach Ward signals nothing: an unreachable
 * identity service is not a sign-out, and the caller sees the original 401.
 *
 * `system.http` is this instance, so every add-on's request gets this too.
 */
api.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    const config = (err as { config?: RetriableConfig }).config
    const status = (err as { response?: { status?: number } }).response?.status
    if (status !== 401 || !config) return Promise.reject(err)
    if (config.wardRetried) {
      signalUnauthorized()
      return Promise.reject(err)
    }

    let refreshed: boolean
    try {
      refreshed = await refreshWardSession()
    } catch {
      return Promise.reject(err)
    }
    if (!refreshed) {
      signalUnauthorized()
      return Promise.reject(err)
    }
    config.wardRetried = true
    return api.request(config)
  }
)
