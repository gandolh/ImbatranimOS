import { FileText } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { Notepad } from './Notepad'
import { recentFilesSource } from './commandSource'

export const manifest: AddonManifest = {
  id: 'notepad',
  name: 'Notepad',
  description: 'Markdown text editor',
  meta: ['editor', 'markdown', 'text', 'write'],
  icon: FileText,
  component: Notepad,
  multiInstance: true,
  defaultSize: { width: 600, height: 500 },
  minSize: { width: 400, height: 300 },
  commandSources: [recentFilesSource],
}
