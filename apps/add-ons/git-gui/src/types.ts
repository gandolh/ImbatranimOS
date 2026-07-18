/** Response shapes mirroring the backend GitService contract. */

export type GitStatusEntry = {
  /** Index (staged) status char: 'M' | 'A' | 'D' | 'R' | '?' | ' ' … */
  index: string
  /** Work-tree (unstaged) status char. */
  worktree: string
  /** Current path (new name for a rename). */
  path: string
  /** Original path for a staged rename/copy, if any. */
  origPath?: string
  /** True when the index side shows a staged change. */
  staged: boolean
}

export type GitCommit = {
  hash: string
  authorName: string
  authorEmail: string
  /** ISO date string. */
  date: string
  subject: string
}

export type StatusResponse = { entries: GitStatusEntry[] }
export type LogResponse = { commits: GitCommit[] }
export type DiffResponse = { diff: string }
export type CommitResponse = { output: string }

/** The named FS roots the backend jail understands (see FilesService ROOTS). */
export type GitRoot = { id: string; label: string }

export const GIT_ROOTS: GitRoot[] = [
  { id: 'home', label: 'Home' },
  { id: 'notes', label: 'Notes' },
]
