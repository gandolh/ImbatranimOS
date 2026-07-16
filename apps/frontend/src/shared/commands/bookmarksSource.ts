import { fetchGroups } from '../../modules/bookmarks/api/bookmarksApi'
import type { CommandSource, CommandItem } from './CommandSourcesRegistry'

const GROUP = 'Bookmarks'

// href cache populated on each search so activate() can open without refetching
const hrefCache = new Map<number, string>()

export const bookmarksSource: CommandSource = {
  group: GROUP,

  async search(query: string): Promise<CommandItem[]> {
    try {
      const groups = await fetchGroups()
      const links = groups.flatMap((g) => g.links)
      links.forEach((l) => hrefCache.set(l.id, l.href))

      return links
        .filter((l) => {
          if (!query) return true
          const q = query.toLowerCase()
          return l.title.toLowerCase().includes(q) || l.href.toLowerCase().includes(q)
        })
        .slice(0, 8)
        .map((l) => ({
          id: `bookmark:${l.id}`,
          label: l.title,
          subtitle: l.href,
          group: GROUP,
        }))
    } catch {
      return []
    }
  },

  activate(item: CommandItem): void {
    const id = parseInt(item.id.replace(/^bookmark:/, ''), 10)
    const href = hrefCache.get(id) ?? item.subtitle
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  },
}
