import { appsSource } from './appsSource'
import { getEnabledApps } from '../registry/enabledApps'
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

const APP_LIMIT = 5

/** Lower is better: 0 name prefix, 1 name word prefix, 2 name substring, 3 keyword, 4 description, 5 subsequence only. */
function appTier(q: string, name: string, description: string, meta: string[]): number {
  const n = name.toLowerCase()
  if (n.startsWith(q)) return 0
  if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1
  if (n.includes(q)) return 2
  if (meta.some((m) => m.toLowerCase().includes(q))) return 3
  if (description.toLowerCase().includes(q)) return 4
  return 5
}

/**
 * Apps first, ranked by match quality and capped so files still show, then every
 * other group in source order. Pure subsequence matches are dropped when a better
 * one exists. Results that point at the same path (a file found by search and by
 * recents) appear once.
 */
export function rankApps<
  T extends { id: string; group: string; label?: string; subtitle?: string },
>(items: T[], query = '', appLimit = APP_LIMIT): T[] {
  const q = query.trim().toLowerCase()
  let apps = items.filter((i) => i.group === 'Apps')
  if (q) {
    const enabled = getEnabledApps()
    const scored = apps.map((item, order) => {
      const app = enabled.find((a) => `app:${a.id}` === item.id)
      const tier = appTier(q, item.label ?? app?.name ?? '', item.subtitle ?? '', app?.meta ?? [])
      return { item, tier, order }
    })
    const best = Math.min(...scored.map((s) => s.tier))
    apps = scored
      .filter((s) => best >= 5 || s.tier < 5)
      .sort((a, b) => a.tier - b.tier || a.order - b.order)
      .map((s) => s.item)
  }
  const seen = new Set<string>()
  const others = items
    .filter((i) => i.group !== 'Apps')
    .filter((i) => {
      if (!i.subtitle) return true
      if (seen.has(i.subtitle)) return false
      seen.add(i.subtitle)
      return true
    })
  return [...apps.slice(0, appLimit), ...others]
}
