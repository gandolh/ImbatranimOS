import { openApp, type CommandSource, type CommandItem } from '@imbatranim/core'
import { fetchRecent } from './api/notepadApi'

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
    // openApp delivers the path as an intent — the Notepad window opens the
    // file instead of just being titled after it (the old shell-owned source
    // couldn't do this without reaching into the module).
    openApp('notepad', { openPath: path })
  },
}
