import { api } from '../../../lib/axios'
import type { NoteEntry, NoteFile, RecentFile } from '../types'

export async function fetchNotes(path: string = ''): Promise<NoteEntry[]> {
  const res = await api.get<NoteEntry[]>('/notes', { params: { path } })
  return res.data
}

export async function readFile(path: string): Promise<NoteFile> {
  const res = await api.get<NoteFile>('/notes/file', { params: { path } })
  return res.data
}

export async function createFile(path: string, content: string = ''): Promise<NoteFile> {
  const res = await api.post<NoteFile>('/notes/file', { path, content })
  return res.data
}

export async function updateFile(path: string, content: string): Promise<NoteFile> {
  const res = await api.put<NoteFile>('/notes/file', { path, content })
  return res.data
}

export async function deleteFile(path: string): Promise<void> {
  await api.delete('/notes/file', { params: { path } })
}

export async function createDirectory(path: string): Promise<void> {
  await api.post('/notes/directory', { path })
}

export async function deleteDirectory(path: string): Promise<void> {
  await api.delete('/notes/directory', { params: { path } })
}

export async function fetchRecent(): Promise<RecentFile[]> {
  const res = await api.get<RecentFile[]>('/notes/recent')
  return res.data
}

export async function upsertRecent(path: string): Promise<void> {
  await api.post('/notes/recent', { path })
}
