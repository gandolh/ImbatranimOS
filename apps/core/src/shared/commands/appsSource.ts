import { APP_REGISTRY } from '../registry/registry'
import { getEnabledApps } from '../registry/enabledApps'
import { useWindowStore } from '../store/windowStore'
import type { CommandSource, CommandItem } from './CommandSourcesRegistry'

const GROUP = 'Apps'

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  // substring match first
  if (t.includes(q)) return true
  // fuzzy: all query chars appear in order in target
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export const appsSource: CommandSource = {
  group: GROUP,

  async search(query: string): Promise<CommandItem[]> {
    return getEnabledApps()
      .filter((app) => {
        const haystack = [app.name, app.description, ...app.meta].join(' ')
        return fuzzyMatch(query, haystack)
      })
      .map((app) => ({
        id: `app:${app.id}`,
        label: app.name,
        subtitle: app.description,
        group: GROUP,
      }))
  },

  activate(item: CommandItem): void {
    const appId = item.id.replace(/^app:/, '')
    const app = APP_REGISTRY.find((a) => a.id === appId)
    if (!app) return

    const { openWindow, windows } = useWindowStore.getState()

    // single-instance: focus existing window if already open
    if (!app.multiInstance) {
      const existing = windows.find((w) => w.appId === appId)
      if (existing) {
        useWindowStore.getState().focusWindow(existing.id)
        useWindowStore.getState().showWindow(existing.id)
        return
      }
    }

    openWindow(app.id, app.name, app.defaultSize, app.minSize)
  },
}
