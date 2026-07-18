import { lazy } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'calendar',
  name: 'Calendar',
  description: 'Month/week views, events, and reminders',
  meta: ['events', 'schedule', 'agenda', 'reminders', 'month', 'week'],
  icon: CalendarIcon,
  component: lazy(() => import('./Calendar').then((m) => ({ default: m.Calendar }))),
  // Single-instance: one calendar, one reminder interval.
  multiInstance: false,
  defaultSize: { width: 720, height: 560 },
  minSize: { width: 480, height: 380 },
}
