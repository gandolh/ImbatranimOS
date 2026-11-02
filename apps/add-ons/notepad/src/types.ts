export type NoteEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  version?: string
}

export type NoteFile = {
  path: string
  content: string
  /** The backend's version token for this content; null if none. */
  version: string | null
}
