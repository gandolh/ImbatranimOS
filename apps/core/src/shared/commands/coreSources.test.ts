import { describe, expect, it } from 'vitest'
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
})
