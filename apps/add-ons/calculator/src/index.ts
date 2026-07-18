import { lazy } from 'react'
import { Calculator as CalculatorIcon } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'calculator',
  name: 'Calculator',
  description: 'Basic arithmetic and a programmer mode with base conversion + bitwise ops',
  meta: ['math', 'arithmetic', 'hex', 'binary', 'octal', 'bitwise', 'programmer'],
  icon: CalculatorIcon,
  component: lazy(() => import('./Calculator').then((m) => ({ default: m.Calculator }))),
  // Single-instance: one calculator window at a time.
  multiInstance: false,
  defaultSize: { width: 320, height: 480 },
  minSize: { width: 280, height: 420 },
}
