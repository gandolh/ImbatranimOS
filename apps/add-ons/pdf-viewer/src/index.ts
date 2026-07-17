import { FileText } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { PdfViewer } from './PdfViewer'

export const manifest: AddonManifest = {
  id: 'pdf-viewer',
  name: 'PDF Viewer',
  description: 'View PDF documents',
  meta: ['pdf', 'document', 'view', 'read', 'reader'],
  icon: FileText,
  component: PdfViewer,
  multiInstance: true,
  defaultSize: { width: 720, height: 640 },
  minSize: { width: 400, height: 360 },
}
