import { FileText } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { Docs } from './Docs'

export const manifest: AddonManifest = {
  id: 'docs',
  name: 'Docs',
  description: 'Edit documents (docx)',
  meta: ['docs', 'document', 'word', 'docx', 'text', 'editor', 'write'],
  icon: FileText,
  component: Docs,
  multiInstance: true,
  defaultSize: { width: 860, height: 680 },
  minSize: { width: 480, height: 380 },
}
