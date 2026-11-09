import type { ArchiveListing, FsEntry } from '../types'

/** Archives Files opens like a folder. */
const BROWSABLE_RE = /\.(zip|tar|tar\.gz|tgz|tar\.bz2|tbz2?|tar\.xz|txz)$/i
/** A single compressed file with no tar inside: nothing to show, only Extract. */
const LONE_RE = /\.(gz|bz2|xz)$/i

/**
 * What a double-click on this file does: `browse` opens it like a folder,
 * `extract` offers Extract (a lone `.gz` has no folder to show), null is not
 * an archive.
 */
export function archiveKind(name: string): 'browse' | 'extract' | null {
  if (BROWSABLE_RE.test(name)) return 'browse'
  if (LONE_RE.test(name)) return 'extract'
  return null
}

/**
 * What a lone compressed file unpacks to, beside itself: its own name without
 * the suffix (`notes.txt.gz` → `notes.txt`), as the backend names it. Null
 * when nothing is left, or the file is not a lone compressed one.
 */
export function loneOutputName(name: string): string | null {
  if (archiveKind(name) !== 'extract') return null
  const out = name.replace(LONE_RE, '')
  return out === '' || out === '.' || out === '..' ? null : out
}

/** An entry name the way the folder view spells it: no leading `./` or `/`, no trailing `/`. */
export function normaliseEntryName(name: string): string {
  return name.replace(/^(\.\/|\/)+/, '').replace(/\/+$/, '')
}

/**
 * The rows of one folder inside an archive. An archive lists flat names, and
 * many omit the folder entries, so a folder exists wherever a name passes
 * through it. Paths are inside-archive paths with no leading slash.
 */
export function folderEntries(listing: ArchiveListing, inner: string): FsEntry[] {
  const out = new Map<string, FsEntry>()
  for (const e of listing.entries) {
    const full = normaliseEntryName(e.name)
    if (full === '') continue
    if (inner !== '' && !full.startsWith(`${inner}/`)) continue
    const rest = inner === '' ? full : full.slice(inner.length + 1)
    if (rest === '') continue
    const slash = rest.indexOf('/')
    const name = slash === -1 ? rest : rest.slice(0, slash)
    const path = inner === '' ? name : `${inner}/${name}`
    const isDir = slash !== -1 || e.directory
    if (isDir) {
      out.set(name, { name, path, type: 'directory', size: 0, modifiedAt: e.modified ?? '' })
    } else {
      out.set(name, { name, path, type: 'file', size: e.size ?? 0, modifiedAt: e.modified ?? '' })
    }
  }
  return [...out.values()]
}

/**
 * The declared entry names to extract for these inside-archive paths: a file
 * is itself, a folder is itself and everything under it. Names come back as
 * the archive spells them; the backend checks each against what the archive
 * declares.
 */
export function entryNamesFor(listing: ArchiveListing, paths: readonly string[]): string[] {
  const wanted = new Set(paths)
  const names: string[] = []
  for (const e of listing.entries) {
    const full = normaliseEntryName(e.name)
    for (const p of wanted) {
      if (full === p || full.startsWith(`${p}/`)) {
        names.push(e.name)
        break
      }
    }
  }
  return names
}

/**
 * Where a breadcrumb click inside an archive goes. The bar shows the archive
 * file's path with the inside path after it, so a click on an ancestor folder
 * leaves the archive and a click on the archive or below stays in.
 */
export function crumbTarget(
  archivePath: string,
  clicked: string
): { leave: true; path: string } | { leave: false; inner: string } {
  if (clicked === archivePath) return { leave: false, inner: '' }
  if (clicked === '' || archivePath.startsWith(`${clicked}/`)) return { leave: true, path: clicked }
  return { leave: false, inner: clicked.slice(archivePath.length + 1) }
}

/** `base.zip`, or `base (2).zip`, … when the name is taken in this folder. */
export function uniqueArchiveName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing)
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}.zip` : `${base} (${n}).zip`
    if (!taken.has(name)) return name
  }
}
