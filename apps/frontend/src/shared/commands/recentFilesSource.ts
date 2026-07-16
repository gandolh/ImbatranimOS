import { fetchRecent } from '../../modules/notepad/api/notepadApi'
import { useWindowStore } from '../store/windowStore'
import { APP_REGISTRY } from '../registry/registry'
import type { CommandSource, CommandItem } from './CommandSourcesRegistry'

const GROUP = 'Recent Files'

export const recentFilesSource: CommandSource = {
  group: GROUP,

  async search(query: string): Promise<CommandItem[]> {
    try {
      const files = await fetchRecent()
      return files
        .filter((f) => {
          if (!query) return true
          return f.path.toLowerCase().includes(query.toLowerCase())
        })
        .slice(0, 8)
        .map((f) => ({
          id: `recent:${f.path}`,
          label: f.path.split('/').pop() ?? f.path,
          subtitle: f.path,
          group: GROUP,
        }))
    } catch {
      return []
    }
  },

  activate(item: CommandItem): void {
    const path = item.id.replace(/^recent:/, '')
    const notepad = APP_REGISTRY.find((a) => a.id === 'notepad')
    if (!notepad) return

    // open new notepad instance — S5 intent delivery is a separate concern
    useWindowStore.getState().openWindow(
      notepad.id,
      path.split('/').pop() ?? 'Notepad',
      notepad.defaultSize,
      notepad.minSize,
    )
  },
}
