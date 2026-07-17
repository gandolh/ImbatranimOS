import { StickyNote } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { StickyNotes } from './StickyNotes'

export const manifest: AddonManifest = {
  id: 'sticky-notes',
  name: 'Sticky Notes',
  description: 'Quick floating sticky notes',
  meta: ['post-it', 'memo', 'note'],
  icon: StickyNote,
  component: StickyNotes,
  multiInstance: true,
  defaultSize: { width: 320, height: 280 },
  minSize: { width: 240, height: 200 },
}
