import { api } from '@imbatranim/core'

/**
 * Fetch a file's raw bytes through core's authed api client (session cookie
 * attached), NOT via a bare `<a href>`/`fetch` to the download URL. Every byte
 * this viewer reads crosses an authenticated request — a 401 trips the shared
 * interceptor and drops the desktop to the lock screen.
 *
 * `GET /api/files/download?root=&path=` streams `application/octet-stream`.
 */
export async function fetchFileBytes(root: string, path: string): Promise<ArrayBuffer> {
  const res = await api.get<ArrayBuffer>('/files/download', {
    params: { root, path },
    responseType: 'arraybuffer',
  })
  return res.data
}
