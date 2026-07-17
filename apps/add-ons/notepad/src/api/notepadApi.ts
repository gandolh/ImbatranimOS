import { api } from '@imbatranim/core'
import type { NoteEntry, NoteFile, RecentFile } from '../types'

const ROOT = 'notes'

export async function fetchNotes(path: string = ''): Promise<NoteEntry[]> {
  const res = await api.get<NoteEntry[]>('/files', { params: { root: ROOT, path } })
  return res.data
}

export async function readFile(path: string): Promise<NoteFile> {
  const res = await api.get<NoteFile>('/files/content', { params: { root: ROOT, path } })
  return res.data
}

export async function createFile(path: string, content: string = ''): Promise<NoteFile> {
  const res = await api.put<NoteEntry>('/files/content', { root: ROOT, path, content })
  return { path: res.data.path, content }
}

export async function updateFile(path: string, content: string): Promise<NoteFile> {
  const res = await api.put<NoteEntry>('/files/content', { root: ROOT, path, content })
  return { path: res.data.path, content }
}

export async function deleteFile(path: string): Promise<void> {
  await api.delete('/files', { params: { root: ROOT, path } })
}

export async function createDirectory(path: string): Promise<void> {
  await api.post('/files/directory', { root: ROOT, path })
}

export async function deleteDirectory(path: string): Promise<void> {
  await api.delete('/files', { params: { root: ROOT, path } })
}

export async function fetchRecent(): Promise<RecentFile[]> {
  const res = await api.get<RecentFile[]>('/notes/recent')
  return res.data
}

export async function upsertRecent(path: string): Promise<void> {
  await api.post('/notes/recent', { path })
}
