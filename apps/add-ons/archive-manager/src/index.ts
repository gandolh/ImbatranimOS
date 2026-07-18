import { lazy } from 'react'
import { FileArchive } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { APP_NAME } from './appName'

export const manifest: AddonManifest = {
  id: 'archive-manager',
  name: APP_NAME,
  description: 'Extract .zip / .tar.gz archives and compress a selection, inside the home folder',
  meta: ['archive', 'zip', 'tar', 'extract', 'unzip', 'compress', 'gzip', 'tgz'],
  icon: FileArchive,
  component: lazy(() => import('./ArchiveManager').then((m) => ({ default: m.ArchiveManager }))),
  // One archive job window at a time; the file-manager launches it per action.
  multiInstance: false,
  defaultSize: { width: 460, height: 340 },
  minSize: { width: 360, height: 240 },
}
