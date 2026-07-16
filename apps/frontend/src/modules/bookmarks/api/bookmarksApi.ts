import { api } from '../../../lib/axios'
import type { BookmarkGroup, BookmarkLink } from '../types'

export async function fetchGroups(): Promise<BookmarkGroup[]> {
  const res = await api.get<BookmarkGroup[]>('/bookmarks/groups')
  return res.data
}

export async function createGroup(data: { name: string; icon?: string }): Promise<BookmarkGroup> {
  const res = await api.post<BookmarkGroup>('/bookmarks/groups', data)
  return res.data
}

export async function updateGroup(
  id: number,
  data: { name?: string; icon?: string },
): Promise<BookmarkGroup> {
  const res = await api.patch<BookmarkGroup>(`/bookmarks/groups/${id}`, data)
  return res.data
}

export async function deleteGroup(id: number): Promise<void> {
  await api.delete(`/bookmarks/groups/${id}`)
}

export async function createLink(data: {
  group_id: number
  title: string
  href: string
  icon?: string
}): Promise<BookmarkLink> {
  const res = await api.post<BookmarkLink>('/bookmarks/links', data)
  return res.data
}

export async function updateLink(
  id: number,
  data: { title?: string; href?: string; icon?: string },
): Promise<BookmarkLink> {
  const res = await api.patch<BookmarkLink>(`/bookmarks/links/${id}`, data)
  return res.data
}

export async function deleteLink(id: number): Promise<void> {
  await api.delete(`/bookmarks/links/${id}`)
}
