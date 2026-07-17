import { Activity } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { SystemMonitor } from './SystemMonitor'

export const manifest: AddonManifest = {
  id: 'system-monitor',
  name: 'System Monitor',
  description: 'Live CPU, memory, disk, and process stats',
  meta: ['cpu', 'ram', 'memory', 'disk', 'processes', 'htop', 'monitor', 'activity'],
  icon: Activity,
  component: SystemMonitor,
  multiInstance: false,
  defaultSize: { width: 560, height: 480 },
  minSize: { width: 420, height: 360 },
}
