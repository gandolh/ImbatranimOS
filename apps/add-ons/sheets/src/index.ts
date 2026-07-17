import { Table } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { Sheets } from './Sheets'

export const manifest: AddonManifest = {
  id: 'sheets',
  name: 'Sheets',
  description: 'Edit spreadsheets (xlsx)',
  meta: ['sheets', 'spreadsheet', 'excel', 'xlsx', 'grid', 'table', 'formula'],
  icon: Table,
  component: Sheets,
  multiInstance: true,
  defaultSize: { width: 900, height: 640 },
  minSize: { width: 480, height: 360 },
}
