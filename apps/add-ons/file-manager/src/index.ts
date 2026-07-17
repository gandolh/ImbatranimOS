import { FolderOpen } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { FileManager } from './FileManager'

export const manifest: AddonManifest = {
  id: 'file-manager',
  name: 'File Manager',
  description: 'Browse and manage files',
  meta: ['files', 'explorer', 'browser', 'folder', 'upload'],
  icon: FolderOpen,
  component: FileManager,
  multiInstance: true,
  defaultSize: { width: 680, height: 500 },
  minSize: { width: 480, height: 320 },
}
