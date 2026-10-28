// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The dotfile writes below flush to the server on a debounce; never a real
// request from a test (brief 181's flake).
vi.mock('../../lib/axios', () => ({
  api: {
    get: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: { written: 0 } }),
    delete: () => Promise.resolve({ data: null }),
  },
}))
import { DOTFILE_KEYS, readPref, writePref } from '../../lib/prefs'
import { useAssociationStore } from '../registry/associations'
import { useAddonStore } from './addonStore'
import { useDesktopStore } from './desktopStore'
import { useStartupStore } from './startupStore'
import {
  APP_ID_MIGRATIONS_KEY,
  RETIRED_APP_IDS,
  currentAppId,
  migrateRetiredAppIds,
} from './retiredApps'

/**
 * Brief 164: the owner's choices for a retired built-in move to its suite
 * app at sign-in, once per pair, and the record of it is a dotfile.
 */

beforeEach(() => {
  localStorage.clear()
  writePref(APP_ID_MIGRATIONS_KEY, '{}')
  useAssociationStore.setState({ overrides: {} })
  useAddonStore.setState({ disabled: [] })
  useDesktopStore.setState({ iconPositions: {} })
  useStartupStore.setState({ apps: [] })
})

describe('migrateRetiredAppIds', () => {
  it('moves every kind of choice from docs to office-docs', () => {
    useAssociationStore.setState({ overrides: { docx: 'docs', md: 'code-editor' } })
    useAddonStore.setState({ disabled: ['docs', 'games'] })
    useDesktopStore.setState({
      iconPositions: {
        docs: { x: 40, y: 80, pinned: true },
        notepad: { x: 0, y: 0, pinned: false },
      },
    })
    useStartupStore.setState({ apps: ['terminal', 'docs'] })

    migrateRetiredAppIds()

    expect(useAssociationStore.getState().overrides).toEqual({
      docx: 'office-docs',
      md: 'code-editor',
    })
    expect(useAddonStore.getState().disabled).toEqual(['office-docs', 'games'])
    expect(useDesktopStore.getState().iconPositions).toEqual({
      'office-docs': { x: 40, y: 80, pinned: true },
      notepad: { x: 0, y: 0, pinned: false },
    })
    expect(useStartupStore.getState().apps).toEqual(['terminal', 'office-docs'])
  })

  it('records that it ran, in a dotfile, and runs once', () => {
    migrateRetiredAppIds()
    expect(JSON.parse(readPref(APP_ID_MIGRATIONS_KEY)!)).toEqual({
      done: RETIRED_APP_IDS.map(([from, to]) => `${from}>${to}`),
    })
    expect(DOTFILE_KEYS as readonly string[]).toContain(APP_ID_MIGRATIONS_KEY)

    // A later choice of the old id (another browser's stale copy) is left alone.
    useStartupStore.setState({ apps: ['docs'] })
    migrateRetiredAppIds()
    expect(useStartupStore.getState().apps).toEqual(['docs'])
  })

  it('runs a pair added later on a desktop that already moved the earlier ones (brief 165)', () => {
    // Moved Docs on brief 164's sign-in; Slides retires a release later.
    writePref(APP_ID_MIGRATIONS_KEY, JSON.stringify({ done: ['docs>office-docs'] }))
    useAssociationStore.setState({ overrides: { pptx: 'slides', docx: 'docs' } })
    useDesktopStore.setState({ iconPositions: { slides: { x: 8, y: 300, pinned: true } } })
    useStartupStore.setState({ apps: ['slides'] })

    migrateRetiredAppIds()

    // The Docs pair is not run again: a later choice of `docs` stays.
    expect(useAssociationStore.getState().overrides).toEqual({
      pptx: 'office-slides',
      docx: 'docs',
    })
    expect(useDesktopStore.getState().iconPositions).toEqual({
      'office-slides': { x: 8, y: 300, pinned: true },
    })
    expect(useStartupStore.getState().apps).toEqual(['office-slides'])
    expect(JSON.parse(readPref(APP_ID_MIGRATIONS_KEY)!).done).toContain('slides>office-slides')
  })

  it("moves norPDF and PDF Viewer onto Office's PDF, norPDF's icon first (brief 167)", () => {
    useAssociationStore.setState({ overrides: { pdf: 'norpdf' } })
    useDesktopStore.setState({
      iconPositions: {
        norpdf: { x: 8, y: 200, pinned: true },
        'pdf-viewer': { x: 8, y: 300, pinned: true },
      },
    })
    useStartupStore.setState({ apps: ['pdf-viewer', 'terminal', 'norpdf'] })

    migrateRetiredAppIds()

    expect(useAssociationStore.getState().overrides).toEqual({ pdf: 'office-pdf' })
    expect(useDesktopStore.getState().iconPositions).toEqual({
      'office-pdf': { x: 8, y: 200, pinned: true },
    })
    expect(useStartupStore.getState().apps).toEqual(['office-pdf', 'terminal'])
  })

  it("disables Office's PDF only when both PDF built-ins were disabled (brief 167)", () => {
    // Hiding the light viewer is not hiding PDF.
    useAddonStore.setState({ disabled: ['pdf-viewer', 'games'] })
    migrateRetiredAppIds()
    expect(useAddonStore.getState().disabled).toEqual(['pdf-viewer', 'games'])

    writePref(APP_ID_MIGRATIONS_KEY, '{}')
    useAddonStore.setState({ disabled: ['norpdf', 'games', 'pdf-viewer'] })
    migrateRetiredAppIds()
    expect(useAddonStore.getState().disabled).toEqual(['office-pdf', 'games'])
  })

  it("keeps a place the owner gave the suite's icon over the built-in's", () => {
    useDesktopStore.setState({
      iconPositions: {
        docs: { x: 40, y: 80, pinned: true },
        'office-docs': { x: 200, y: 10, pinned: true },
      },
    })
    migrateRetiredAppIds()
    expect(useDesktopStore.getState().iconPositions).toEqual({
      'office-docs': { x: 200, y: 10, pinned: true },
    })
  })

  it('does not list an id twice', () => {
    useStartupStore.setState({ apps: ['docs', 'office-docs'] })
    useAddonStore.setState({ disabled: ['office-docs', 'docs'] })
    migrateRetiredAppIds()
    expect(useStartupStore.getState().apps).toEqual(['office-docs'])
    expect(useAddonStore.getState().disabled).toEqual(['office-docs'])
  })

  it('changes nothing for a desktop that never used the built-in', () => {
    const overrides = useAssociationStore.getState().overrides
    const disabled = useAddonStore.getState().disabled
    migrateRetiredAppIds()
    expect(useAssociationStore.getState().overrides).toBe(overrides)
    expect(useAddonStore.getState().disabled).toBe(disabled)
  })
})

describe('currentAppId', () => {
  it("reads a retired built-in's id as its suite app's (recents)", () => {
    for (const [from, to] of RETIRED_APP_IDS) expect(currentAppId(from)).toBe(to)
    expect(currentAppId('notepad')).toBe('notepad')
  })
})
