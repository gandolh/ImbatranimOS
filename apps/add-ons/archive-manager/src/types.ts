export type ArchiveFormat = 'zip' | 'targz'

/**
 * The one-shot payload the file-manager context menu hands the window via
 * `openApp('archive-manager', intent)`. Two shapes: extract an archive, or
 * compress a selection.
 */
export type ArchiveIntent =
  | { action: 'extract'; root: string; path: string; dest?: string }
  | {
      action: 'compress'
      root: string
      paths: string[]
      dest: string
      format: ArchiveFormat
    }

export interface ExtractResult {
  dest: string
  entries: number
  totalBytes: number
}

export interface CompressResult {
  dest: string
  entries: number
  bytes: number
}

/** A directory listing row from the files API (subset we render). */
export interface DirEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
}
