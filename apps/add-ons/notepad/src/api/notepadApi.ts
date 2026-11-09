import { FileConflictError, type SystemHttp } from '@imbatranim/ui'
import type { NoteEntry, NoteFile } from '../types'
import type { NotepadRoot } from '../lib/notepadRoot'

/**
 * Every call now takes the root explicitly.
 *
 * It used to be the module constant `'notes'`, which is what put Notepad on a
 * different filesystem from every other app in the OS — see `lib/notepadRoot.ts`
 * for the migration rule. There is deliberately no default parameter: a silent
 * fallback is how one call site quietly keeps writing to the old root.
 *
 * Plain functions take the capability as their first argument; only
 * hooks may call `useSystem()`, and these are not hooks.
 */

export async function fetchNotes(
  http: SystemHttp,
  root: NotepadRoot,
  path: string = ''
): Promise<NoteEntry[]> {
  const res = await http.get<NoteEntry[]>('/files', { params: { root, path } })
  return res.data
}

export async function readFile(
  http: SystemHttp,
  root: NotepadRoot,
  path: string
): Promise<NoteFile> {
  const res = await http.get<{ path: string; content: string; version?: string }>(
    '/files/content',
    { params: { root, path } }
  )
  return { path: res.data.path, content: res.data.content, version: res.data.version ?? null }
}

export async function createFile(
  http: SystemHttp,
  root: NotepadRoot,
  path: string,
  content: string = ''
): Promise<NoteFile> {
  const res = await http.put<NoteEntry>('/files/content', { root, path, content })
  return { path: res.data.path, content, version: res.data.version ?? null }
}

/**
 * Save over `path`. With `expected` (the version the editor read), a file that
 * changed on disk since throws {@link FileConflictError} and nothing is written
 *; without it, the write is a blind overwrite.
 */
export async function updateFile(
  http: SystemHttp,
  root: NotepadRoot,
  path: string,
  content: string,
  expected?: string
): Promise<NoteFile> {
  try {
    const res = await http.put<NoteEntry>('/files/content', { root, path, content, expected })
    return { path: res.data.path, content, version: res.data.version ?? null }
  } catch (err) {
    const response = (err as { response?: { status?: number; data?: { current?: unknown } } })
      .response
    if (response?.status === 409) {
      const current = response.data?.current
      throw new FileConflictError(typeof current === 'string' ? current : null)
    }
    throw err
  }
}

export async function deleteFile(http: SystemHttp, root: NotepadRoot, path: string): Promise<void> {
  await http.delete('/files', { params: { root, path } })
}

export async function createDirectory(
  http: SystemHttp,
  root: NotepadRoot,
  path: string
): Promise<void> {
  await http.post('/files/directory', { root, path })
}

export async function deleteDirectory(
  http: SystemHttp,
  root: NotepadRoot,
  path: string
): Promise<void> {
  await http.delete('/files', { params: { root, path } })
}

/**
 * Does the legacy `notes` root still hold anything?
 *
 * Drives the one-time default-root decision. Returns false rather than throwing on
 * any error: if the answer cannot be had, opening into `home` (the consistent
 * choice) is the better failure.
 */
export async function notesRootHasFiles(_http: SystemHttp): Promise<boolean> {
  // Notepad reads only the files it is given (2026-11-09), so it can't list
  // the `notes` root to look: asking would only be refused. Opening into
  // `home` is the answer it fell back to anyway; the picker still offers Notes.
  return false
}
