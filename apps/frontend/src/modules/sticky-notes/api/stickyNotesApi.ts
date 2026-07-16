import { api } from '../../../lib/axios'
import type { StickyNote } from '../types'

export async function fetchStickyNotes(): Promise<StickyNote[]> {
  const res = await api.get<StickyNote[]>('/sticky-notes')
  return res.data
}

export async function createStickyNote(data: {
  content?: string
  pos_x?: number
  pos_y?: number
}): Promise<StickyNote> {
  const res = await api.post<StickyNote>('/sticky-notes', data)
  return res.data
}

export async function updateStickyNote(
  id: number,
  data: Partial<{ content: string; pos_x: number; pos_y: number }>,
): Promise<StickyNote> {
  const res = await api.patch<StickyNote>(`/sticky-notes/${id}`, data)
  return res.data
}

export async function deleteStickyNote(id: number): Promise<void> {
  await api.delete(`/sticky-notes/${id}`)
}
