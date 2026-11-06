import { describe, expect, it, vi } from 'vitest'

vi.mock('../registry/enabledApps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../registry/enabledApps')>()),
  getEnabledApps: () => [
    { id: 'sticky', name: 'Sticky Notes', description: 'Pin notes', meta: [] },
    { id: 'notepad', name: 'Notepad', description: 'Text', meta: [] },
    { id: 'todo', name: 'Todo', description: 'Tasks and notes', meta: [] },
    { id: 'bm', name: 'Bookmarks', description: 'Links', meta: ['notes'] },
    { id: 'anno', name: 'Keynote', description: 'Draw', meta: [] },
    { id: 'tx', name: 'Terminal', description: 'Shell', meta: [] },
  ],
}))
import { COMMAND_SOURCES } from './CommandSourcesRegistry'
import { rankApps } from './coreSources'

describe('the core command sources', () => {
  it('register apps, files and recent files once', () => {
    const groups = COMMAND_SOURCES.map((s) => s.group)
    for (const g of ['Apps', 'Files', 'Recent files']) {
      expect(groups.filter((x) => x === g)).toHaveLength(1)
    }
  })

  it('rank apps before files and keep each group in order', () => {
    const ranked = rankApps([
      { id: 'f1', group: 'Files' },
      { id: 'a1', group: 'Apps' },
      { id: 'r1', group: 'Recent files' },
      { id: 'a2', group: 'Apps' },
    ])
    expect(ranked.map((i) => i.id)).toEqual(['a1', 'a2', 'f1', 'r1'])
  })

  const app = (id: string, label: string, subtitle: string) => ({
    id: `app:${id}`,
    group: 'Apps',
    label,
    subtitle,
  })

  it('ranks by name prefix, word prefix, substring, keyword, then description', () => {
    const ranked = rankApps(
      [
        app('todo', 'Todo', 'Tasks and notes'),
        app('bm', 'Bookmarks', 'Links'),
        app('anno', 'Keynote', 'Draw'),
        app('sticky', 'Sticky Notes', 'Pin notes'),
        app('notepad', 'Notepad', 'Text'),
      ],
      'note'
    )
    expect(ranked.map((i) => i.id)).toEqual([
      'app:notepad',
      'app:sticky',
      'app:anno',
      'app:bm',
      'app:todo',
    ])
  })

  it('drops pure subsequence matches when better ones exist, keeps them otherwise', () => {
    const items = [app('tx', 'Terminal', 'Shell'), app('notepad', 'Notepad', 'Text')]
    expect(rankApps(items, 'note').map((i) => i.id)).toEqual(['app:notepad'])
    expect(rankApps(items, 'tmnl').map((i) => i.id)).toEqual(['app:tx', 'app:notepad'])
  })

  it('caps apps so files still show, and lists each path once', () => {
    const apps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => app(x, `Note ${x}`, 'x'))
    const ranked = rankApps(
      [
        ...apps,
        { id: 'file:home:file:n/a.txt', group: 'Files', label: 'a.txt', subtitle: 'n/a.txt' },
        {
          id: 'recent:home:notepad:n/a.txt',
          group: 'Recent files',
          label: 'a.txt',
          subtitle: 'n/a.txt',
        },
        {
          id: 'recent:home:notepad:n/b.txt',
          group: 'Recent files',
          label: 'b.txt',
          subtitle: 'n/b.txt',
        },
      ],
      'note'
    )
    expect(ranked.filter((i) => i.group === 'Apps')).toHaveLength(5)
    expect(ranked.slice(5).map((i) => i.id)).toEqual([
      'file:home:file:n/a.txt',
      'recent:home:notepad:n/b.txt',
    ])
  })
})
