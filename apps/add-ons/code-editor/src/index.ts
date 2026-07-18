import { lazy } from 'react'
import { Code2 } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'code-editor',
  name: 'Code Editor',
  description: 'Edit source files with syntax highlighting, tabs, and find/replace',
  meta: ['code', 'editor', 'monaco', 'source', 'syntax', 'ide', 'develop', 'programming'],
  icon: Code2,
  // Lazy so Monaco (heavy) lands in this chunk, never the eager desktop bundle.
  component: lazy(() => import('./CodeEditor').then((m) => ({ default: m.CodeEditor }))),
  multiInstance: true,
  defaultSize: { width: 960, height: 680 },
  minSize: { width: 520, height: 360 },
}
