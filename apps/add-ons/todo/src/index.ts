import { lazy } from 'react'
import { ListTodo } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'todo',
  name: 'Todo',
  description: 'Task list and to-dos',
  meta: ['tasks', 'checklist', 'reminders'],
  icon: ListTodo,
  component: lazy(() => import('./Todo').then((m) => ({ default: m.Todo }))),
  multiInstance: false,
  defaultSize: { width: 360, height: 480 },
  minSize: { width: 280, height: 300 },
}
