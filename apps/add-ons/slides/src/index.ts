import { Presentation } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { Slides } from './Slides'

export const manifest: AddonManifest = {
  id: 'slides',
  name: 'Slides',
  description: 'Preview PowerPoint presentations',
  meta: ['slides', 'powerpoint', 'pptx', 'presentation', 'deck', 'view'],
  icon: Presentation,
  component: Slides,
  multiInstance: true,
  defaultSize: { width: 800, height: 620 },
  minSize: { width: 420, height: 360 },
}
