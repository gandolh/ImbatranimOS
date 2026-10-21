/** A path under the API's base (`/api` unless `VITE_API_URL` says otherwise), as an absolute URL. */
export function apiUrl(path: string): URL {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
  return new URL(`${base.replace(/\/+$/, '')}/${path}`, window.location.href)
}
