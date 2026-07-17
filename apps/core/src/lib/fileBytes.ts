import { api } from './axios'

/** True when an error carries an HTTP status (axios-style), matching `status`. */
function hasHttpStatus(err: unknown, status: number): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    (err as { response?: { status?: number } }).response?.status === status
  )
}

/**
 * Fetch a file's raw bytes through core's authed api client (session cookie
 * attached), NOT via a bare `<a href>`/`fetch`. Every byte crosses an
 * authenticated request — a 401 trips the shared interceptor and drops the
 * desktop to the lock screen.
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

/** Raised when the backend refuses an over-cap upload (413). */
export class UploadTooLargeError extends Error {
  constructor(message = 'File exceeds the maximum upload size.') {
    super(message)
    this.name = 'UploadTooLargeError'
  }
}

/**
 * Serialize+save bytes back to the same path via `POST /api/files/upload`
 * (multipart; the service overwrites in place and auto-creates parent dirs).
 * Surfaces an over-cap upload as {@link UploadTooLargeError} so the editor can
 * show a clear message instead of a generic failure.
 */
export async function uploadFileBytes(
  root: string,
  path: string,
  bytes: ArrayBuffer | Uint8Array,
  name: string
): Promise<void> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // Copy into a standalone ArrayBuffer so the Blob owns contiguous bytes.
  const blob = new Blob([view.slice()], {
    type: 'application/octet-stream',
  })
  const form = new FormData()
  form.append('root', root)
  form.append('path', path)
  form.append('file', blob, name)
  try {
    await api.post('/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  } catch (err) {
    if (hasHttpStatus(err, 413)) {
      throw new UploadTooLargeError()
    }
    throw err
  }
}

/**
 * Build the direct download URL for a file. Note: this is a bare URL (used for
 * `<a href>`-style downloads), NOT an authed api-client request — reach for
 * {@link fetchFileBytes} when the bytes must cross the authenticated client.
 */
export function downloadUrl(root: string, path: string): string {
  const base = import.meta.env.VITE_API_URL as string
  return `${base}/files/download?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`
}

/** Last path segment (the file's own name), or `fallback` when the path is empty. */
export function fileName(path: string, fallback = 'file'): string {
  return path.split('/').pop() || fallback
}
