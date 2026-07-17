import { Bookmark } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { Bookmarks } from './Bookmarks'
import { bookmarksSource } from './commandSource'

export const manifest: AddonManifest = {
  id: 'bookmarks',
  name: 'Bookmarks',
  description: 'Save and organize links',
  meta: ['links', 'favorites', 'urls'],
  icon: Bookmark,
  component: Bookmarks,
  multiInstance: false,
  defaultSize: { width: 480, height: 520 },
  minSize: { width: 320, height: 400 },
  commandSources: [bookmarksSource],
}
