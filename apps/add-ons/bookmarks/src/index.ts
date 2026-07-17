import { lazy } from 'react'
import { Bookmark } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { bookmarksSource } from './commandSource'

export const manifest: AddonManifest = {
  id: 'bookmarks',
  name: 'Bookmarks',
  description: 'Save and organize links',
  meta: ['links', 'favorites', 'urls'],
  icon: Bookmark,
  component: lazy(() => import('./Bookmarks').then((m) => ({ default: m.Bookmarks }))),
  multiInstance: false,
  defaultSize: { width: 480, height: 520 },
  minSize: { width: 320, height: 400 },
  commandSources: [bookmarksSource],
}
