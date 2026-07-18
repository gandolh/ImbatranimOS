import { api } from '@imbatranim/core'
import type { FsEntry } from './types'

/**
 * Thin `GET /files?root=&path=` wrapper — add-ons may not import the
 * file-manager package, so this list call is defined locally instead of
 * reused. Mirrors `listDirectory` in
 * `apps/add-ons/file-manager/src/api/filesApi.ts`.
 */
export async function listDir(root: string, path: string): Promise<FsEntry[]> {
  const res = await api.get<FsEntry[]>('/files', { params: { root, path } })
  return res.data
}
