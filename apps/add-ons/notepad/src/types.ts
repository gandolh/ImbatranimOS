export type NoteEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  version?: string
}

export type NoteFile = {
  path: string
  content: string
  /** The backend's version token for this content (brief 155); null if none. */
  version: string | null
}
