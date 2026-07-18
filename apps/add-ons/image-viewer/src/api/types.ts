/**
 * Mirrors file-manager's `FsEntry` shape (the item shape of
 * `GET /files?root=&path=`). Add-ons may not import the file-manager package,
 * so this is a local, minimal copy — not a re-export — kept in sync by hand.
 * See `apps/add-ons/file-manager/src/api/filesApi.ts` for the canonical source.
 */
export type FsEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}
