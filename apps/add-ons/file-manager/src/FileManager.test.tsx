// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemProvider, type SystemHandle } from '@imbatranim/ui'
import { FileManager } from './FileManager'
import type { FsEntry } from './types'

/**
 * The listing's background menu (New Folder, New Document, Paste) and its
 * click-to-clear reach the whole pane, not only the rows' height; a
 * right-click on a row still opens that row's menu.
 *
 * jsdom has no layout, so the pane-filling height itself is checked in a real
 * browser (the brief's walk); here the listing element carries the handlers
 * and the class that sizes it to the scroll area, which is a size container.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Element.prototype.getAnimations ??= () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// jsdom lays nothing out; give every element a pane-sized box so the list's
// virtualizer has a viewport to fill and draws the rows.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 })
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 600 })

const ENTRIES: FsEntry[] = [
  { name: 'a.txt', path: 'a.txt', type: 'file', size: 3, modifiedAt: '2026-11-03T10:00:00Z' },
  { name: 'b.txt', path: 'b.txt', type: 'file', size: 3, modifiedAt: '2026-11-03T10:00:00Z' },
]

const LISTING = {
  format: 'zip',
  entries: [
    {
      name: 'top.txt',
      size: 4,
      compressedSize: 4,
      directory: false,
      modified: null,
      nameRepaired: false,
    },
    {
      name: 'docs/a.md',
      size: 2,
      compressedSize: 2,
      directory: false,
      modified: null,
      nameRepaired: false,
    },
  ],
  refused: [],
  encrypted: false,
  truncated: false,
}

type FakeOpts = {
  intent?: unknown
  post?: ReturnType<typeof vi.fn>
  pickDirectory?: SystemHandle['fs']['pickDirectory']
}

function fakeSystem(opts: FakeOpts = {}): SystemHandle {
  const noop = () => {}
  const unsubscribe = () => noop
  return {
    protocolVersion: 2,
    appId: 'file-manager',
    windowId: 'w1',
    fs: {
      read: vi.fn(),
      readWithVersion: vi.fn(),
      upload: vi.fn(),
      downloadUrl: () => '',
      pickOpen: vi.fn(),
      pickSave: vi.fn(),
      pickDirectory: opts.pickDirectory ?? vi.fn(),
      recordRecent: noop,
      removeRecent: noop,
      reopenRecent: async () => undefined,
    },
    http: {
      get: vi.fn(async (url: string) => ({
        data: url === '/files' ? ENTRIES : url === '/archive/list' ? LISTING : [],
        status: 200,
        headers: {},
      })),
      post: opts.post ?? vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as SystemHandle['http'],
    window: {
      setTitle: noop,
      requestClose: noop,
      focus: noop,
      hide: noop,
      show: noop,
      isFocused: () => true,
      isVisible: () => true,
      onCloseRequest: unsubscribe,
    },
    intents: {
      openApp: () => '',
      consume: () => opts.intent as never,
      onIntent: unsubscribe,
      associations: {
        resolveOpener: () => ({ appId: 'notepad', reason: 'declared' }),
        candidatesFor: () => [],
        allCandidates: () => [],
        keyFor: (name: string) => name.split('.').pop() ?? name,
        openerName: () => null,
        setDefault: noop,
      },
    },
    shortcuts: { register: unsubscribe, document: unsubscribe },
    appearance: { get: () => ({ theme: 'light', accent: '#000' }) },
    schedule: { claim: async () => true },
    notify: () => '',
    on: unsubscribe,
  }
}

let container: HTMLDivElement
let root: Root

async function renderFileManager(opts: FakeOpts = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <SystemProvider system={fakeSystem(opts)}>
          <FileManager windowId="w1" />
        </SystemProvider>
      </QueryClientProvider>
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function rightClick(el: Element) {
  act(() => {
    el.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 300 })
    )
  })
}

const menuLabels = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim() ?? '')

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('File Manager listing', () => {
  it('fills the pane: the scroll area is a size container and the listing is 100cqh tall', async () => {
    await renderFileManager()
    const listing = container.querySelector('[data-fm-listing]')
    expect(listing).not.toBeNull()
    expect(listing!.className).toContain('min-h-[100cqh]')
    const scrollRoot = listing!.closest('[class*="[container-type:size]"]')
    expect(scrollRoot).not.toBeNull()
  })

  it('opens the background menu from the empty space below the rows', async () => {
    await renderFileManager()
    expect(container.textContent).toContain('b.txt')
    const listing = container.querySelector('[data-fm-listing]')!
    rightClick(listing)
    const labels = menuLabels()
    expect(labels).toEqual(expect.arrayContaining(['New Folder', 'New Document']))
    expect(labels.some((l) => l.startsWith('Paste'))).toBe(true)
    expect(labels).not.toContain('Rename')
  })

  it("opens a row's own menu from the row", async () => {
    await renderFileManager()
    const row = [...container.querySelectorAll('tr')].find((tr) =>
      tr.textContent?.includes('a.txt')
    )!
    rightClick(row)
    const labels = menuLabels()
    expect(labels).toContain('Rename')
    expect(labels).not.toContain('New Folder')
  })
})

describe('File Manager inside an archive', () => {
  const open = { intent: { openPath: 'pics.zip', root: 'home' } }
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

  it('shows the archive as a read-only folder and says why writes are off', async () => {
    await renderFileManager(open)
    expect(container.textContent).toContain('Read-only: inside pics.zip')
    expect(container.textContent).toContain('top.txt')
    expect(container.textContent).toContain('docs')
    expect(container.textContent).not.toContain('b.txt')
    const newFolder = button('New Folder') as HTMLButtonElement
    expect(newFolder.disabled).toBe(true)
    expect(newFolder.title).toContain('read-only')
  })

  it('offers only Extract on a row, not Rename or Delete', async () => {
    await renderFileManager(open)
    const row = [...container.querySelectorAll('tr')].find((tr) =>
      tr.textContent?.includes('top.txt')
    )!
    rightClick(row)
    const labels = menuLabels()
    expect(labels).toContain('Extract…')
    expect(labels).toContain('Extract all…')
    expect(labels).not.toContain('Rename')
    expect(labels).not.toContain('Delete')
  })

  it('asks where, then starts the extraction of everything', async () => {
    const post = vi.fn(async () => ({ data: { id: 'j1' } }))
    await renderFileManager({ ...open, post })
    await act(async () => {
      button('Extract all')!.click()
    })
    expect(document.body.textContent).toContain('named after the archive')
    await act(async () => {
      ;[...document.querySelectorAll('button')]
        .filter((b) => b.textContent === 'Extract')
        .at(-1)!
        .click()
    })
    expect(post).toHaveBeenCalledWith('/archive/extract-job', {
      root: 'home',
      path: 'pics.zip',
      dest: undefined,
      entries: undefined,
    })
  })
})

describe('File Manager extracting a lone compressed file', () => {
  const open = { intent: { openPath: 'docs/notes.txt.gz', root: 'home' } }
  const button = (label: string) =>
    [...document.querySelectorAll('button')].filter((b) => b.textContent === label).at(-1)

  it('says it unpacks beside the file, without the suffix', async () => {
    const post = vi.fn(async () => ({ data: { id: 'j1' } }))
    await renderFileManager({ ...open, post })
    expect(document.body.textContent).toContain('notes.txt from notes.txt.gz')
    expect(document.querySelector('[data-testid="extract-dest"]')!.textContent).toContain(
      'Beside it, as notes.txt.'
    )
    await act(async () => {
      button('Extract')!.click()
    })
    expect(post).toHaveBeenCalledWith('/archive/extract-job', {
      root: 'home',
      path: 'docs/notes.txt.gz',
      dest: undefined,
      entries: undefined,
    })
  })

  it("Choose folder… opens in the archive's folder", async () => {
    const pickDirectory = vi.fn(async () => ({ root: 'home', path: 'elsewhere' }))
    await renderFileManager({ ...open, pickDirectory })
    await act(async () => {
      button('Choose folder…')!.click()
    })
    expect(pickDirectory).toHaveBeenCalledWith({
      title: 'Extract to',
      startIn: { root: 'home', path: 'docs' },
    })
    expect(document.querySelector('[data-testid="extract-dest"]')!.textContent).toContain(
      'elsewhere'
    )
  })
})
