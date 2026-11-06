import { lazy } from 'react'
import { FileText } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'notepad',
  name: 'Notepad',
  description: 'Edit text and Markdown, with a live preview',
  meta: ['editor', 'markdown', 'md', 'text', 'write', 'preview', 'docs'],
  icon: FileText,
  component: lazy(() => import('./Notepad').then((m) => ({ default: m.Notepad }))),
  opens: ['txt', 'log', 'md', 'markdown'],
  multiInstance: true,
  defaultSize: { width: 760, height: 560 },
  minSize: { width: 400, height: 300 },
}
