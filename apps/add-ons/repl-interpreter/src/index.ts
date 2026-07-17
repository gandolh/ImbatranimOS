import { lazy } from 'react'
import { SquareTerminal } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'terminal',
  name: 'Terminal',
  description: 'A real shell on the machine',
  meta: ['shell', 'terminal', 'bash', 'console', 'command line'],
  icon: SquareTerminal,
  component: lazy(() => import('./Terminal').then((m) => ({ default: m.Terminal }))),
  multiInstance: true,
  defaultSize: { width: 700, height: 460 },
  minSize: { width: 400, height: 240 },
}
