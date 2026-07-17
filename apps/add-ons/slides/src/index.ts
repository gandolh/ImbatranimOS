import { lazy } from 'react'
import { Presentation } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'slides',
  name: 'Slides',
  description: 'Preview PowerPoint presentations',
  meta: ['slides', 'powerpoint', 'pptx', 'presentation', 'deck', 'view'],
  icon: Presentation,
  component: lazy(() => import('./Slides').then((m) => ({ default: m.Slides }))),
  multiInstance: true,
  defaultSize: { width: 800, height: 620 },
  minSize: { width: 420, height: 360 },
}
