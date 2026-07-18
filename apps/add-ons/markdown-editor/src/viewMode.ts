import { Columns2, Eye, Pencil } from 'lucide-react'
import type { ComponentType } from 'react'

/** The three ways the editor can lay out its two panes. */
export type ViewMode = 'editor' | 'split' | 'preview'

export type ViewModeOption = {
  mode: ViewMode
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
}

// Kept as data (not JSX) so no component renders an icon picked at call time —
// each option's icon is referenced directly in JSX, never invoked as a value.
export const VIEW_MODE_OPTIONS: ViewModeOption[] = [
  { mode: 'editor', label: 'Editor only', icon: Pencil },
  { mode: 'split', label: 'Split view', icon: Columns2 },
  { mode: 'preview', label: 'Preview only', icon: Eye },
]
