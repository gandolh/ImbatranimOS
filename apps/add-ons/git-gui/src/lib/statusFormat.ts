import type { GitStatusEntry } from '../types'

/** Short human label for a porcelain status code (index or worktree column). */
export function codeLabel(code: string): string {
  switch (code) {
    case 'M':
      return 'Modified'
    case 'A':
      return 'Added'
    case 'D':
      return 'Deleted'
    case 'R':
      return 'Renamed'
    case 'C':
      return 'Copied'
    case 'U':
      return 'Unmerged'
    case '?':
      return 'Untracked'
    case '!':
      return 'Ignored'
    default:
      return ''
  }
}

/** The status char to badge an entry with (prefer the staged/index side). */
export function badgeCode(entry: GitStatusEntry): string {
  if (entry.staged) return entry.index
  if (entry.worktree !== ' ') return entry.worktree
  return entry.index !== ' ' ? entry.index : '?'
}

/** Tailwind text-colour token for a status code. */
export function codeColor(code: string): string {
  switch (code) {
    case 'A':
      return 'text-primary'
    case 'M':
    case 'R':
    case 'C':
      return 'text-tertiary'
    case 'D':
      return 'text-error'
    case '?':
      return 'text-on-surface-variant'
    default:
      return 'text-on-surface-variant'
  }
}

/** Split entries into staged vs. unstaged/untracked buckets for the two lists. */
export function partitionEntries(entries: GitStatusEntry[]): {
  staged: GitStatusEntry[]
  unstaged: GitStatusEntry[]
} {
  const staged: GitStatusEntry[] = []
  const unstaged: GitStatusEntry[] = []
  for (const e of entries) {
    // An entry can be in BOTH lists (e.g. 'MM': staged + further edits).
    if (e.staged) staged.push(e)
    const hasWorktreeChange = e.worktree !== ' ' && e.worktree !== ''
    if (hasWorktreeChange) unstaged.push(e)
  }
  return { staged, unstaged }
}
