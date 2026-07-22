import { lazy } from 'react'
import { FilePen } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'norpdf',
  name: 'norPDF',
  description: 'Read, search and navigate PDF documents',
  meta: ['pdf', 'document', 'read', 'reader', 'view', 'search', 'annotate'],
  icon: FilePen,
  component: lazy(() => import('./NorPdf').then((m) => ({ default: m.NorPdf }))),
  multiInstance: true,
  defaultSize: { width: 960, height: 720 },
  minSize: { width: 520, height: 420 },
}
