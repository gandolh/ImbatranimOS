import { api } from '@imbatranim/core'

/**
 * Mirrors the shape of file-manager's `GET /files` entries. Kept as a local
 * type — add-ons may import ONLY `@imbatranim/core`, never a sibling add-on
 * package, so this is redeclared here rather than imported.
 */
type FsEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

export type MediaKind = 'audio' | 'video'

export type Track = {
  path: string
  name: string
  kind: MediaKind
}

// Kept in lockstep with the extension list registered for `media-player` in
// the shell's `openWith.ts` (see brief 38).
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv']

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * The playable media kind for `path`'s extension, or `null` when it isn't
 * one of the audio/video extensions this player is registered for.
 */
export function mediaKind(path: string): MediaKind | null {
  const ext = extensionOf(path)
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  return null
}

/** Parent folder path of `path` (`""` for a top-level file). */
export function parentDir(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

/**
 * List the sibling media files in the same folder as `path` — the folder
 * "queue" a track was opened from — filtered to playable extensions and
 * name-sorted. A thin wrapper over core's `api`, mirroring file-manager's
 * `GET /files?root=&path=` contract without importing the file-manager
 * package.
 */
export async function listFolderTracks(root: string, path: string): Promise<Track[]> {
  const folder = parentDir(path)
  const res = await api.get<FsEntry[]>('/files', { params: { root, path: folder } })
  const tracks: Track[] = []
  for (const entry of res.data) {
    if (entry.type !== 'file') continue
    const kind = mediaKind(entry.path)
    if (!kind) continue
    tracks.push({ path: entry.path, name: entry.name, kind })
  }
  tracks.sort((a, b) => a.name.localeCompare(b.name))
  return tracks
}
