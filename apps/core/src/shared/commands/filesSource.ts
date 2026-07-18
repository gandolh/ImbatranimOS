import { api } from '../../lib/axios'
import { openApp } from '../intents/openApp'
import type { CommandSource, CommandItem } from './CommandSourcesRegistry'

const GROUP = 'Files'
// v1 searches a single root (the brief scopes cross-root search out). The home
// root is the user's whole filesystem jail — the useful default.
const SEARCH_ROOT = 'home'

type SearchHit = {
  name: string
  path: string
  type: 'file' | 'directory'
}

type SearchResponse = {
  items: SearchHit[]
  truncated: boolean
}

/** `file:<root>:<type>:<path>` — root/type never contain ':', path is the tail. */
function encodeId(hit: SearchHit): string {
  return `file:${SEARCH_ROOT}:${hit.type}:${hit.path}`
}

function decodeId(id: string): { root: string; type: string; path: string } {
  const rest = id.slice('file:'.length)
  const firstColon = rest.indexOf(':')
  const root = rest.slice(0, firstColon)
  const afterRoot = rest.slice(firstColon + 1)
  const secondColon = afterRoot.indexOf(':')
  const type = afterRoot.slice(0, secondColon)
  const path = afterRoot.slice(secondColon + 1)
  return { root, type, path }
}

/**
 * Command-palette source backed by the jailed backend FS search. Debounce is
 * handled by the palette input, so this stays a thin fetch. Any failure returns
 * [] so a down/erroring backend just drops this source (existing behavior).
 */
export const filesSource: CommandSource = {
  group: GROUP,

  async search(query: string): Promise<CommandItem[]> {
    const q = query.trim()
    if (!q) return []
    try {
      const { data } = await api.get<SearchResponse>('/files/search', {
        params: { root: SEARCH_ROOT, query: q },
      })
      return data.items.map((hit) => ({
        id: encodeId(hit),
        label: hit.name,
        subtitle: hit.path,
        group: GROUP,
      }))
    } catch {
      // A failing source is skipped — matches searchAllSources' contract.
      return []
    }
  },

  activate(item: CommandItem): void {
    const { root, type, path } = decodeId(item.id)
    // Reveal the containing folder: a directory navigates to itself, a file to
    // its parent directory (root when the file sits at the top level).
    const dir =
      type === 'directory' ? path : path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    openApp('file-manager', { navigatePath: dir, root })
  },
}
