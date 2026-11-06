import { Columns2, Eye, Pencil } from 'lucide-react'
import type { ComponentType } from 'react'

/** The ways the editor can lay out its panes. Split is for Markdown files only. */
export type ViewMode = 'edit' | 'split' | 'preview'

export type ViewModeOption = {
  mode: ViewMode
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
}

// Kept as data (not JSX) so no component renders an icon picked at call time —
// each option's icon is referenced directly in JSX, never invoked as a value.
export const VIEW_MODE_OPTIONS: ViewModeOption[] = [
  { mode: 'edit', label: 'Edit', icon: Pencil },
  { mode: 'split', label: 'Split view', icon: Columns2 },
  { mode: 'preview', label: 'Preview as Markdown', icon: Eye },
]

const MARKDOWN_FILE = /\.(md|markdown)$/i

/** Markdown files get the split view, the outline and the format toolbar. */
export function isMarkdownFile(path: string): boolean {
  return MARKDOWN_FILE.test(path)
}

/** What a file opens in: split for Markdown, edit for everything else. */
export function defaultViewMode(path: string): ViewMode {
  return isMarkdownFile(path) ? 'split' : 'edit'
}
