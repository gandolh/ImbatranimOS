export type NoteEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
}

export type NoteFile = {
  path: string
  content: string
}

export type RecentFile = {
  id: number
  path: string
  last_opened: string
}
