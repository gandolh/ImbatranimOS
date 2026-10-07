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
    name: 'Hollow',
    description: 'A small town sim.',
    meta: [],
    type: 'static',
    icon: 'gamepad-2',
    window: { defaultSize: { w: 960, h: 640 }, minSize: { w: 640, h: 400 } },
    capabilities: ['notify'],
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
