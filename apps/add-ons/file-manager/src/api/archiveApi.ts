import type { SystemHttp } from '@imbatranim/ui'
import type { ArchiveJob, ArchiveListing, CompressResult } from '../types'

// The backend's archive module. Every path is jailed there, and every entry
// name, a selected subset included, is re-validated against zip-slip there.
// GET  /api/archive/list?root=&path=
// POST /api/archive/extract-job   (json: root, path, dest?, entries?)
// GET  /api/archive/job/:id
// POST /api/archive/compress      (json: root, paths, dest, format)

/** Read an archive's contents, extracting nothing. */
export async function listArchive(
  http: SystemHttp,
  root: string,
  path: string
): Promise<ArchiveListing> {
  const res = await http.get<ArchiveListing>('/archive/list', { params: { root, path } })
  return res.data
}

/** Start an extraction and get an id to poll. `entries` absent means everything. */
export async function startExtractJob(
  http: SystemHttp,
  root: string,
  path: string,
  dest?: string,
  entries?: string[]
): Promise<{ id: string }> {
  const res = await http.post<{ id: string }>('/archive/extract-job', {
    root,
    path,
    dest,
    entries,
  })
  return res.data
}

export async function fetchJob(http: SystemHttp, id: string): Promise<ArchiveJob> {
  const res = await http.get<ArchiveJob>(`/archive/job/${id}`)
  return res.data
}

export async function compressPaths(
  http: SystemHttp,
  root: string,
  paths: string[],
  dest: string,
  format: 'zip' | 'targz'
): Promise<CompressResult> {
  const res = await http.post<CompressResult>('/archive/compress', { root, paths, dest, format })
  return res.data
}

/** The message from an axios-style failure, else a plain fallback. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const maybe = err as {
      response?: { data?: { message?: string | string[] } }
      message?: string
    }
    const msg = maybe.response?.data?.message
    if (Array.isArray(msg)) return msg.join(', ')
    if (typeof msg === 'string') return msg
    if (typeof maybe.message === 'string') return maybe.message
  }
  return 'Operation failed'
}
