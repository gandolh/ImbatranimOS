// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }))
vi.mock('../../lib/axios', () => ({ api: { get, post, delete: del } }))

import { syncMarketplaceApps, type MarketplaceApp } from '../../shared/registry/marketplace'
import { MarketplaceSettings } from './MarketplaceSettings'
import type { Inspection } from './urlApps'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Brief 158 — "Check for update" on an app installed from a URL. The stored
 * URL is inspected again; what comes back may be a new commit of the same app,
 * the same commit, or (when the URL now resolves to another folder or repo) a
 * different app altogether, which must not be offered as this row's update.
 */

const OLD = 'a'.repeat(40)
const NEW = 'b'.repeat(40)
const ID = 'x-0123456789ab'
const MOVED =
  'This URL now points to a different app. Install it from the field above if you want it.'

function urlApp(): MarketplaceApp {
  return {
    id: ID,
    descriptorId: ID,
    descriptorName: 'Hollow',
    name: 'Hollow',
    description: 'A small town sim.',
    meta: [],
    type: 'static',
    icon: 'gamepad-2',
    window: { defaultSize: { w: 960, h: 640 }, minSize: { w: 640, h: 400 } },
    capabilities: ['notify'],
    multiInstance: false,
    opens: [],
    minSystemVersion: 2,
    ref: OLD,
    runtime: 'sandboxed',
    source: {
      url: 'https://github.com/o/r/tree/main/sub',
      repo: 'https://github.com/o/r',
      ref: 'main',
      commit: OLD,
      subdir: 'sub',
    },
    installed: { ref: OLD, buildId: 'url', installedAt: 0, missing: false },
    job: null,
    server: { state: 'stopped' },
  }
}

function inspection(over: Partial<Inspection> = {}): Inspection {
  return {
    pending: 'p2',
    id: ID,
    manifest: {
      name: 'Hollow',
      description: 'A small town sim.',
      meta: [],
      icon: 'gamepad-2',
      capabilities: ['notify'],
    },
    source: { ...urlApp().source!, commit: NEW },
    current: { commit: OLD },
    ...over,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue({ data: { apps: [urlApp()], problems: [] } })
  del.mockResolvedValue({})
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  syncMarketplaceApps([])
})

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MarketplaceSettings />
      </QueryClientProvider>
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  expect(container.textContent).toContain('Hollow')
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined

async function checkForUpdate() {
  await act(async () => button('Check for update')!.click())
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('MarketplaceSettings: Check for update on a URL app', () => {
  it('re-inspects the stored URL and offers a new commit of the same app', async () => {
    post.mockResolvedValueOnce({ data: inspection() })
    await render()
    await checkForUpdate()
    expect(post).toHaveBeenCalledWith('/marketplace/url/inspect', {
      url: 'https://github.com/o/r/tree/main/sub',
    })
    expect(container.textContent).toContain('Nobody has reviewed this app.')
    expect(container.textContent).toContain(`Installed at ${OLD.slice(0, 7)}. This replaces it.`)
    expect(button('Install')).toBeDefined()
    expect(del).not.toHaveBeenCalled()
  })

  it('says up to date at the same commit, and drops the inspection', async () => {
    post.mockResolvedValueOnce({ data: inspection({ source: urlApp().source! }) })
    await render()
    await checkForUpdate()
    expect(container.textContent).toContain('Up to date.')
    expect(container.textContent).not.toContain('Nobody has reviewed this app.')
    expect(del).toHaveBeenCalledWith('/marketplace/url/pending/p2')
  })

  it('refuses to offer a different app as this one’s update', async () => {
    post.mockResolvedValueOnce({
      data: inspection({
        id: 'x-ffffffffffff',
        manifest: { ...inspection().manifest, name: 'Something Else' },
        current: null,
      }),
    })
    await render()
    await checkForUpdate()
    expect(del).toHaveBeenCalledWith('/marketplace/url/pending/p2')
    expect(container.textContent).toContain(MOVED)
    expect(container.textContent).not.toContain('Nobody has reviewed this app.')
    expect(container.textContent).not.toContain('Something Else')
    expect(button('Install')).toBeUndefined()

    // A later check that finds the app again clears the message.
    post.mockResolvedValueOnce({ data: inspection({ pending: 'p3', source: urlApp().source! }) })
    await checkForUpdate()
    expect(container.textContent).not.toContain(MOVED)
    expect(container.textContent).toContain('Up to date.')
  })
})

describe('MarketplaceSettings: problems', () => {
  it('offers Uninstall for an installed app whose record is damaged, apart from catalog problems', async () => {
    get.mockResolvedValue({
      data: {
        apps: [urlApp()],
        problems: [
          { file: 'broken.json', problem: 'not JSON' },
          {
            file: 'x-dead00000000',
            problem: 'installed from a URL, but its stored manifest is damaged: uninstall it',
            appId: 'x-dead00000000',
          },
        ],
      },
    })
    await render()
    expect(container.textContent).toContain('Installed apps that could not be read')
    expect(container.textContent).toContain('Catalog entries that could not be read')
    expect(container.textContent).toContain('broken.json')

    const uninstalls = () =>
      [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Uninstall')
    // One for the URL app's row, one for the damaged record.
    expect(uninstalls()).toHaveLength(2)
    await act(async () => uninstalls()[1].click())
    const confirmButton = [...document.querySelectorAll('button')]
      .filter((b) => b.textContent === 'Uninstall')
      .find((b) => !container.contains(b) || b.closest('[role="dialog"], [role="alertdialog"]'))
    expect(confirmButton).toBeDefined()
    await act(async () => confirmButton!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(del).toHaveBeenCalledWith('/marketplace/apps/x-dead00000000')
  })
})

/** An app of the two-app suite `office` (brief 162). */
function officeApp(
  id: string,
  name: string,
  installed: boolean,
  extra: Partial<MarketplaceApp> = {}
): MarketplaceApp {
  return {
    ...urlApp(),
    id,
    descriptorId: 'office',
    descriptorName: 'Office',
    name,
    description: `${name}, from the suite.`,
    icon: 'file-text',
    runtime: 'native',
    source: undefined,
    ref: OLD,
    installed: installed
      ? {
          ref: OLD,
          buildId: 'b1',
          installedAt: 0,
          entryPath: `marketplace/apps/office/b/b1/${id}/app.mjs`,
          missing: false,
        }
      : null,
    ...extra,
  }
}

describe('MarketplaceSettings: a descriptor with several apps (brief 162)', () => {
  const suite = (installed: boolean) => [
    officeApp('office-docs', 'Docs', installed, { multiInstance: true }),
    officeApp('office-sheets', 'Sheets', installed),
  ]

  async function renderSuite(apps: MarketplaceApp[]) {
    get.mockResolvedValue({ data: { apps, problems: [] } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MarketplaceSettings />
        </QueryClientProvider>
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  }

  const buttons = (label: string) =>
    [...container.querySelectorAll('button')].filter((b) => b.textContent === label)

  it('shows the suite as one row, with its apps under its name', async () => {
    await renderSuite(suite(true))
    expect(container.textContent).toContain('Office')
    expect(container.textContent).toContain('2 apps')
    const list = container.querySelector('ul[aria-label="Office\'s apps"]')!
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'DocsDocs, from the suite.Open',
      'SheetsSheets, from the suite.Open',
    ])
    expect(buttons('Uninstall')).toHaveLength(1)
    expect(buttons('Log')).toHaveLength(1)
    expect(container.querySelector('button[aria-label="Open Docs"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Open Sheets"]')).not.toBeNull()
  })

  it('installs the descriptor, once', async () => {
    post.mockResolvedValue({ data: { state: 'queued' } })
    await renderSuite(suite(false))
    expect(buttons('Install')).toHaveLength(1)
    expect(buttons('Open')).toHaveLength(0)
    await act(async () => buttons('Install')[0].click())
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/marketplace/apps/office/install')
  })

  it("reads the descriptor's log", async () => {
    await renderSuite(suite(true))
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url === '/marketplace'
          ? { data: { apps: suite(true), problems: [] } }
          : { data: 'built 3 files' }
      )
    )
    await act(async () => buttons('Log')[0].click())
    expect(get).toHaveBeenCalledWith('/marketplace/apps/office/log', { responseType: 'text' })
    expect(container.textContent).toContain('built 3 files')
  })

  it("uninstalls the descriptor and closes every one of its apps' windows", async () => {
    await renderSuite(suite(true))
    const { useWindowStore } = await import('../../shared/store/windowStore')
    const before = useWindowStore.getState()
    const closed: string[] = []
    useWindowStore.setState({
      windows: [
        { id: 'w1', appId: 'office-docs' },
        { id: 'w2', appId: 'office-docs' },
        { id: 'w3', appId: 'office-sheets' },
        { id: 'w4', appId: 'notepad' },
      ] as never,
      closeWindow: (id: string) => closed.push(id),
    })
    await act(async () => buttons('Uninstall')[0].click())
    expect(document.body.textContent).toContain('Its apps (Docs, Sheets) go with it')
    const confirmButton = [...document.querySelectorAll('button')]
      .filter((b) => b.textContent === 'Uninstall')
      .find((b) => b.closest('[role="dialog"], [role="alertdialog"]'))
    await act(async () => confirmButton!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(del).toHaveBeenCalledWith('/marketplace/apps/office')
    expect(closed).toEqual(['w1', 'w2', 'w3'])
    useWindowStore.setState({ windows: before.windows, closeWindow: before.closeWindow })
  })

  it('says when a built-in app has one of its apps’ ids', async () => {
    await renderSuite([
      officeApp('settings', 'Settings', true),
      officeApp('office-sheets', 'Sheets', true),
    ])
    expect(container.textContent).toContain(
      'A built-in app already has the id settings, so the built-in opens instead.'
    )
    expect(container.querySelector('button[aria-label="Open Settings"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Open Sheets"]')).not.toBeNull()
  })
})
