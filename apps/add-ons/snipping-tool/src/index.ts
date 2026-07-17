import { lazy } from 'react'
import { Scissors } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { APP_NAME } from './appName'

export const manifest: AddonManifest = {
  id: 'snipping-tool',
  name: APP_NAME,
  description: 'Capture, annotate, and save a screenshot of the desktop',
  meta: ['screenshot', 'capture', 'snip', 'grab', 'annotate', 'redact', 'pixelate'],
  icon: Scissors,
  component: lazy(() => import('./SnippingTool').then((m) => ({ default: m.SnippingTool }))),
  // Single-instance: only one capture session at a time.
  multiInstance: false,
  // The window is hidden immediately; size only matters for its store record.
  defaultSize: { width: 320, height: 120 },
  minSize: { width: 200, height: 80 },
}
