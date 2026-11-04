// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileChoice, PickSaveOptions } from '@imbatranim/ui'

/**
 * `startIn` on the file dialogs: Open and Save as open in the folder an app
 * names (or the folder holding a file it names), and anything the user
 * couldn't reach by walking the dialog opens at the home root, as before.
 *
 * The real handle, portal and picker; only the `/files` listing is fake. It
 * answers for the folders below and refuses everything else, the way the
 * backend's jail refuses a path outside a root or one that doesn't exist.
 */

type Entry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}
const file = (path: string): Entry => ({
  name: path.split('/').pop()!,
  path,
  type: 'file',
  size: 1,
  modifiedAt: '2026-11-03T10:00:00Z',
})
const folder = (path: string): Entry => ({ ...file(path), type: 'directory' })

const FS: Record<string, Entry[]> = {
  'home::': [folder('Drawings'), file('notes.txt')],
  'home::Drawings': [file('Drawings/plan.dwg'), folder('Drawings/Old')],
  'home::Drawings/Old': [file('Drawings/Old/first.dwg')],
  'notes::': [file('todo.md')],
}

const { get } = vi.hoisted(() => ({
  get: vi.fn(async (_url: string, config: { params: { root: string; path: string } }) => {
    const listing = FS[`${config.params.root}::${config.params.path}`]
    if (!listing)
      throw Object.assign(new Error('Request failed with status code 400'), { status: 400 })
    return { data: listing }
  }),
}))
vi.mock('../lib/axios', () => ({ api: { get } }))
vi.mock('../lib/recentFiles', () => ({
  useRecentFilesQuery: () => ({ data: [] }),
  recordRecentFile: vi.fn(),
  removeRecentFile: vi.fn(),
}))

import { createSystemHandle } from './createSystemHandle'
import { FilePortalHost } from './filePortal'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Element.prototype.getAnimations ??= () => []

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  get.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<FilePortalHost />))
})

afterEach(async () => {
  // The portal's queue outlives a test: cancel what is still open, as Escape does.
  for (let i = 0; i < 10 && document.querySelector('[role="dialog"]'); i++) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await settle()
  }
  act(() => root.unmount())
  document.body.innerHTML = ''
})

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  })

/** Opens Save as through the handle and waits for the dialog to settle. */
async function openSave(
  opts: PickSaveOptions = {}
): Promise<{ pending: Promise<FileChoice | null> }> {
  const system = createSystemHandle('cad', null)
  let pending!: Promise<FileChoice | null>
  act(() => {
    pending = system.fs.pickSave({ title: 'Save as', ...opts })
  })
  await settle()
  // Wrapped: an async function returning the promise itself would wait for it.
  return { pending }
}

/** The folder the dialog shows, as its breadcrumb reads, and the names listed. */
function shown(): { at: string; names: string[] } {
  const crumb = [...document.querySelectorAll('span')].find((s) => s.textContent?.startsWith('/'))
  const names = [...document.querySelectorAll<HTMLButtonElement>('button[type="button"]')]
    .map((b) => b.textContent?.trim() ?? '')
    .filter((t) => t && !['Home', 'Notes', 'Save', '×'].includes(t))
  return { at: crumb?.textContent ?? '?', names }
}

const askedFor = () => get.mock.calls.map(([, c]) => `${c.params.root}::${c.params.path}`)

describe('startIn on the file dialogs', () => {
  it('opens in the folder it names', async () => {
    await openSave({ startIn: { root: 'home', path: 'Drawings' } })
    expect(shown()).toEqual({ at: '/Drawings', names: ['Old', 'plan.dwg'] })
    // No detour through the home root on the way.
    expect(askedFor()).toEqual(['home::Drawings'])
  })

  it('opens in the folder holding the file it names', async () => {
    await openSave({ startIn: { root: 'home', path: 'Drawings/plan.dwg' } })
    expect(shown().at).toBe('/Drawings')
  })

  it('opens in another root it offers', async () => {
    await openSave({ startIn: { root: 'notes', path: '' } })
    expect(shown()).toEqual({ at: '/', names: ['todo.md'] })
  })

  it.each([
    ['a root the dialog does not offer', { root: 'etc', path: '' }],
    ['a folder that no longer exists', { root: 'home', path: 'Gone' }],
    ['a file that no longer exists', { root: 'home', path: 'Drawings/gone.dwg' }],
    ['a path the jail refuses', { root: 'home', path: 'secret' }],
    ['a path that climbs out of its root', { root: 'home', path: 'Drawings/../../etc' }],
  ])('opens at the home root for %s, without an error', async (_, startIn) => {
    await openSave({ startIn })
    expect(shown()).toEqual({ at: '/', names: ['Drawings', 'notes.txt'] })
    expect(document.body.textContent).not.toContain('Could not read that folder')
    expect(askedFor().some((p) => p.includes('..'))).toBe(false)
  })

  it('opens at the home root without it, as before', async () => {
    await openSave()
    expect(shown().at).toBe('/')
    expect(askedFor()).toEqual(['home::'])
  })

  it('saves into the folder it opened in, and the user can still walk away from it', async () => {
    const { pending } = await openSave({
      startIn: { root: 'home', path: 'Drawings/plan.dwg' },
      suggestedName: 'plan.dxf',
    })
    const up = document.querySelector<HTMLButtonElement>('button[aria-label="Up one folder"]')!
    expect(up.disabled).toBe(false)
    act(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click()
    )
    await expect(pending).resolves.toEqual({ root: 'home', path: 'Drawings/plan.dxf' })
  })

  it('pickOpen takes it too', async () => {
    const system = createSystemHandle('cad', null)
    act(() => {
      void system.fs.pickOpen({ startIn: { root: 'home', path: 'Drawings/Old' } })
    })
    await settle()
    expect(shown().at).toBe('/Drawings/Old')
  })
})
