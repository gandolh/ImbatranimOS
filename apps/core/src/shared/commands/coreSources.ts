import { appsSource } from './appsSource'
import { filesSource } from './filesSource'
import { recentFilesSource } from './recentFilesSource'
import { registerCommandSource, COMMAND_SOURCES } from './CommandSourcesRegistry'

// The core-owned sources, registered once (guarded against HMR double
// registration). The command palette and Start's search both import this file,
// so the two read the same sources and never disagree. App-owned sources
// (bookmarks) come from the add-on manifests and are registered by
// src/manifest.ts.
for (const source of [appsSource, filesSource, recentFilesSource]) {
  if (!COMMAND_SOURCES.find((s) => s.group === source.group)) registerCommandSource(source)
}

/** Apps first (name and meta words), then every other group in source order. */
export function rankApps<T extends { group: string }>(items: T[]): T[] {
  return [...items.filter((i) => i.group === 'Apps'), ...items.filter((i) => i.group !== 'Apps')]
}
