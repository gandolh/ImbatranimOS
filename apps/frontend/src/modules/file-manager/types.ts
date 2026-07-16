export type FsEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

export type FsRoot = {
  id: string
  label: string
}

export const FS_ROOTS: FsRoot[] = [
  { id: 'home', label: 'Home' },
  { id: 'notes', label: 'Notes' },
]
