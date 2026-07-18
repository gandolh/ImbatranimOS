import { api } from '@imbatranim/core'
import type { ArchiveFormat, CompressResult, DirEntry, ExtractResult } from '../types'

/** POST /api/archive/extract — unpack `path` into `dest` (jailed server-side). */
export async function extractArchive(
  root: string,
  path: string,
  dest?: string
): Promise<ExtractResult> {
  const { data } = await api.post<ExtractResult>('/archive/extract', {
    root,
    path,
    dest,
  })
  return data
}

/** POST /api/archive/compress — pack `paths[]` into the archive at `dest`. */
export async function compressPaths(
  root: string,
  paths: string[],
  dest: string,
  format: ArchiveFormat
): Promise<CompressResult> {
  const { data } = await api.post<CompressResult>('/archive/compress', {
    root,
    paths,
    dest,
    format,
  })
  return data
}

/** GET /api/files — list a directory (used to preview extracted contents). */
export async function listDir(root: string, path: string): Promise<DirEntry[]> {
  const { data } = await api.get<DirEntry[]>('/files', {
    params: { root, path },
  })
  return data
}

/** Human-readable byte size (helpers live in a `.ts`, per add-on convention). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** Last path segment of a virtual path (no node:path in the browser bundle). */
export function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

/** Extract a human error message from an axios-style failure. */
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
