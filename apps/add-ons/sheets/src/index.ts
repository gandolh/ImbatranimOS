import { lazy } from 'react'
import { Table } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

export const manifest: AddonManifest = {
  id: 'sheets',
  name: 'Sheets',
  description: 'Edit spreadsheets (xlsx)',
  meta: ['sheets', 'spreadsheet', 'excel', 'xlsx', 'grid', 'table', 'formula'],
  icon: Table,
  component: lazy(() => import('./Sheets').then((m) => ({ default: m.Sheets }))),
  multiInstance: true,
  defaultSize: { width: 900, height: 640 },
  minSize: { width: 480, height: 360 },
}
