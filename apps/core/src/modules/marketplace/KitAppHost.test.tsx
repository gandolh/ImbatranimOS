// @vitest-environment jsdom
/// <reference types="node" />
import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemProvider } from '@imbatranim/ui'
import { createSystemHandle } from '../../system/createSystemHandle'
import { AppErrorBoundary } from '../../shared/components/window/AppErrorBoundary'
import { resetCrashToastHistory } from '../../shared/components/window/crashToastGuard'
import { syncMarketplaceApps, type MarketplaceApp } from '../../shared/registry/marketplace'
import { useNotificationStore } from '../../shared/store/notificationStore'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const post = vi.fn()
const del = vi.fn()
vi.mock('../../lib/axios', () => ({
  api: {
    get: vi.fn(),
    post: (...args: unknown[]) => post(...args) as unknown,
    delete: (...args: unknown[]) => del(...args) as unknown,
  },
}))

// The browser imports the module by URL; the test runner imports the same
// file by path.
const loads = vi.fn()
vi.mock('./loadModule', () => ({
  loadModule: (url: string) => {
    loads(url)
    return import(/* @vite-ignore */ fileURLToPath(url))
  },
}))

const { openApp } = vi.hoisted(() => ({ openApp: vi.fn() }))
vi.mock('../../shared/intents/openApp', () => ({ openApp }))

const { KitAppHost } = await import('./KitAppHost')
const { importKitModule, startKitApp } = await import('./kitModule')
const { apiUrl } = await import('./apiUrl')

/**
 * Brief 163 — a kit app in a window: a real ES module, written here as a
 * kit app's build would leave it (no imports; React, the JSX runtime and the
 * kit read from `globalThis.__imbatranimShared`), rendered in the desktop's
 * own tree inside the window's boundary, provider and Suspense, exactly as
 * `WindowContainer` wraps every app.
 */

let dir: string
let container: HTMLDivElement
let root: Root

function app(overrides: Partial<MarketplaceApp> = {}): MarketplaceApp {
  const id = overrides.id ?? 'kit-notes'
  return {
    id,
    descriptorId: 'kit',
    descriptorName: 'Kit',
    name: 'Kit Notes',
    description: '',
    meta: [],
    type: 'static',
    icon: 'file-text',
    window: { defaultSize: { w: 640, h: 420 }, minSize: { w: 320, h: 240 } },
    capabilities: ['fs', 'intents'],
    multiInstance: true,
    opens: [],
    minSystemVersion: 2,
    sharedKit: 1,
    ref: 'a'.repeat(40),
    runtime: 'native',
    installed: {
      ref: 'a'.repeat(40),
      buildId: 'b1',
      installedAt: 0,
      entryPath: 'notes/app.mjs',
      stylePaths: ['kit.css'],
      missing: false,
    },
    job: null,
    server: { state: 'stopped' },
    ...overrides,
  }
}

type Seen = {
  version?: number
  windowIds?: string[]
  host?: { appId: string; assetBase: string; server: { http: string; ws: string } | null }
  appId?: string
  fs?: string
  notifyError?: string
  unmounted?: number
}
const seen = () => (globalThis as { __kitSeen?: Seen }).__kitSeen ?? {}

/** A kit app: reads the shared modules as it evaluates, uses the kit's hooks and dialog. */
const KIT_MODULE = `
const shared = globalThis.__imbatranimShared
const React = shared.modules['react']
const { jsx, jsxs } = shared.modules['react/jsx-runtime']
const { Button, useConfirm, useSystem } = shared.modules['@imbatranim/ui']
const seen = (globalThis.__kitSeen = { version: shared.version, windowIds: [] })

export function App({ windowId, host }) {
  const system = useSystem()
  const { confirm, confirmDialog } = useConfirm()
  const [answer, setAnswer] = React.useState('none')
  React.useEffect(() => {
    seen.windowIds.push(windowId)
    seen.host = host
    seen.appId = system.appId
    seen.fs = typeof system.fs.readWithVersion
    try { system.notify } catch (err) { seen.notifyError = err.message }
    return () => { seen.unmounted = (seen.unmounted || 0) + 1 }
  }, [system, windowId, host])
  const ask = () =>
    confirm({ title: 'Clear the note?', message: 'It cannot be undone.', confirmLabel: 'Clear', destructive: true })
      .then((ok) => setAnswer(String(ok)))
  return jsxs('div', {
    'data-kit-app': host.appId,
    children: [
      jsx(Button, { size: 'sm', onClick: ask, children: 'Clear…' }),
      jsx('output', { 'data-answer': '', children: answer }),
      confirmDialog,
    ],
  })
}
`

/** Write the build's files and point the API base at them. */
function writeBuild(files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  vi.stubEnv('VITE_API_URL', pathToFileURL(dir).href)
}

/** The window's content, as `WindowContainer` wraps it. */
function window(a: MarketplaceApp, windowId: string) {
  return (
    <AppErrorBoundary
      key={windowId}
      appId={a.id}
      appName={a.name}
      fallback={(error) => <p data-fallback={windowId}>{error.message}</p>}
    >
      <SystemProvider system={createSystemHandle(a.id, windowId)}>
        <Suspense fallback={<p>Loading…</p>}>
          <KitAppHost windowId={windowId} app={a} />
        </Suspense>
      </SystemProvider>
    </AppErrorBoundary>
  )
}

function render(...windows: [MarketplaceApp, string][]) {
  act(() => root.render(<>{windows.map(([a, id]) => window(a, id))}</>))
}

const kitLinks = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[data-kit-build]')]

/** Let the host's async load run, the page's stylesheets "load" (jsdom fetches none), and render. */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      for (const l of kitLinks()) l.dispatchEvent(new Event('load'))
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

const fallback = (windowId = 'w1') =>
  container.querySelector(`[data-fallback="${windowId}"]`)?.textContent ?? null

/** The refusal panel's heading, sentence and button (brief 175), or null. */
const refusal = () => {
  const panel = container.querySelector('[data-refusal]')
  if (!panel) return null
  const [heading, sentence] = [...panel.querySelectorAll('p')].map((p) => p.textContent)
  const button = panel.querySelector('button')
  return { heading, sentence, button: button?.textContent ?? null, click: () => button?.click() }
}

/** The titles of the live toasts. */
const toasts = () => {
  const { toasts: ids, notifications } = useNotificationStore.getState()
  return ids.map((id) => notifications.find((n) => n.id === id)?.title)
}

beforeEach(() => {
  const cache = join(process.cwd(), 'node_modules', '.cache')
  mkdirSync(cache, { recursive: true })
  dir = mkdtempSync(join(cache, 'kit-host-'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container, { onCaughtError: () => undefined })
  delete (globalThis as { __kitSeen?: Seen }).__kitSeen
  resetCrashToastHistory()
  useNotificationStore.setState({ notifications: [], toasts: [] })
  openApp.mockReset()
  loads.mockReset()
  post.mockReset()
  del.mockReset()
  post.mockResolvedValue({ data: { lease: 'lease-1', renewMs: 60_000 } })
  del.mockResolvedValue({})
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  syncMarketplaceApps([])
  for (const l of kitLinks()) l.remove()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('KitAppHost', () => {
  it("renders the app's component in the desktop's tree, with the desktop's React and kit", async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    render([app(), 'w1'])
    await settle()
    expect(fallback()).toBeNull()
    expect(container.querySelector('[data-kit-app="kit-notes"]')).not.toBeNull()
    expect(seen().version).toBe(1)
    expect(seen().windowIds).toEqual(['w1'])
    expect(seen().host).toEqual({
      appId: 'kit-notes',
      assetBase: `${pathToFileURL(dir).href}/notes/`,
      server: null,
    })
    expect(post).not.toHaveBeenCalled()

    act(() => root.render(<></>))
    expect(seen().unmounted).toBe(1)
  })

  it('gives useSystem() the scoped handle: what was asked for works, anything else throws', async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    render([app(), 'w1'])
    await settle()
    expect(seen().appId).toBe('kit-notes')
    expect(seen().fs).toBe('function')
    expect(seen().notifyError).toBe(
      'Kit Notes did not ask for system.notify; add "notify" to its descriptor\'s capabilities'
    )
  })

  it("opens the kit's ConfirmDialog and reads the answer", async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    render([app(), 'w1'])
    await settle()
    const ask = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Clear…')!
    await act(async () => ask.click())
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
    expect(dialog?.textContent).toContain('Clear the note?')
    expect(dialog?.textContent).toContain('It cannot be undone.')
    const confirm = [...dialog!.querySelectorAll('button')].find((b) => b.textContent === 'Clear')!
    await act(async () => confirm.click())
    await settle()
    expect(container.querySelector('[data-answer]')?.textContent).toBe('true')
  })

  it('starts the import before the host mounts, and the host takes that one (brief 182)', async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    startKitApp(app())
    expect(loads).toHaveBeenCalledOnce()
    // The module evaluated with the shared kit already on the global.
    await act(async () => {
      await importKitModule(apiUrl('notes/app.mjs').href)
    })
    expect(seen().version).toBe(1)
    render([app(), 'w1'])
    await settle()
    expect(container.querySelector('[data-kit-app="kit-notes"]')).not.toBeNull()
    expect(loads).toHaveBeenCalledOnce()
  })

  it('starts nothing for a refused app (brief 175)', () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    startKitApp(app({ sharedKit: 99 }))
    startKitApp(app({ minSystemVersion: 99 }))
    startKitApp(app({ installed: null }))
    expect(loads).not.toHaveBeenCalled()
  })

  it('forgets a failed import, so the next window tries again', async () => {
    writeBuild({ 'kit.css': '' })
    startKitApp(app())
    await act(async () => {
      await importKitModule(apiUrl('notes/app.mjs').href).catch(() => undefined)
    })
    render([app(), 'w1'])
    await settle()
    // The window asked again rather than reusing the failed promise. Whether
    // the second fetch can succeed is the module loader's business: the
    // runner, like a browser's module map, remembers a missing file.
    expect(loads).toHaveBeenCalledTimes(2)
    expect(fallback()).toContain('notes/app.mjs')
  })

  it('refuses an app built for another shared kit in a panel, not a crash, before fetching anything', async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    render([app({ sharedKit: 99, type: 'service' }), 'w1'])
    await settle()
    expect(refusal()).toMatchObject({
      heading: "Can't open Kit Notes",
      sentence:
        'Kit Notes was built for shared kit 99, and this desktop has shared kit 1. It needs an update built for kit 1.',
      button: 'Open Settings',
    })
    expect(fallback()).toBeNull()
    expect(loads).not.toHaveBeenCalled()
    expect(kitLinks()).toEqual([])
    // Brief 175: no toast and no client-error log; nothing is leased either.
    expect(toasts()).toEqual([])
    expect(post).not.toHaveBeenCalled()

    act(() => refusal()!.click())
    expect(openApp).toHaveBeenCalledExactlyOnceWith('settings')
  })

  it('refuses an app that needs a newer system protocol in the same panel', async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    render([app({ minSystemVersion: 99 }), 'w1'])
    await settle()
    expect(refusal()).toMatchObject({
      heading: "Can't open Kit Notes",
      sentence: 'Kit Notes needs system protocol 99; this desktop speaks 2',
      button: 'Open Settings',
    })
    expect(fallback()).toBeNull()
    expect(loads).not.toHaveBeenCalled()
    expect(toasts()).toEqual([])
    expect(post).not.toHaveBeenCalled()
  })

  it('still shows an app that throws as a crash, with the toast and the client-error log', async () => {
    writeBuild({
      'notes/app.mjs': 'export function App() { throw new Error("the kit app broke") }\n',
      'kit.css': '',
    })
    render([app(), 'w1'])
    await settle()
    expect(fallback()).toBe('the kit app broke')
    expect(refusal()).toBeNull()
    expect(toasts()).toEqual(['Kit Notes crashed'])
    expect(post.mock.calls.map(([url]) => url as string)).toEqual(['/logs/client-error'])
  })

  it('shows a module without App as a crash of its own window', async () => {
    writeBuild({ 'notes/app.mjs': 'export function mount() {}\n', 'kit.css': '' })
    render([app(), 'w1'])
    await settle()
    expect(fallback()).toBe("Kit Notes's module does not export App, a React component")
  })

  it('adds one link per stylesheet of a build, however many windows open, and the registry removes it with the build', async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    const notes = app()
    const other = app({ id: 'kit-board', name: 'Kit Board' })
    render([notes, 'w1'], [notes, 'w2'], [other, 'w3'])
    await settle()
    expect(seen().windowIds?.sort()).toEqual(['w1', 'w2', 'w3'])
    const links = kitLinks()
    expect(links).toHaveLength(1)
    expect(links[0].rel).toBe('stylesheet')
    expect(links[0].getAttribute('data-kit-build')).toBe('kit@b1')
    expect(links[0].getAttribute('href')).toBe(`${pathToFileURL(dir).href}/kit.css`)

    // Closing the windows leaves it: the build is still installed.
    act(() => root.render(<></>))
    syncMarketplaceApps([notes, other])
    expect(kitLinks()).toHaveLength(1)
    // An update brings another build; an uninstall none.
    syncMarketplaceApps([app({ installed: { ...notes.installed!, buildId: 'b2' } })])
    expect(kitLinks()).toEqual([])
  })

  it("leases a service kit app's server by its descriptor's id before rendering it", async () => {
    writeBuild({ 'notes/app.mjs': KIT_MODULE, 'kit.css': '' })
    render([app({ type: 'service' }), 'w1'])
    await settle()
    expect(post).toHaveBeenCalledWith('/marketplace/apps/kit/lease', {})
    expect(seen().host?.appId).toBe('kit-notes')
    expect(seen().host?.server?.http).toMatch(/\/marketplace\/apps\/kit\/server$/)
    expect(seen().host?.server?.ws).toMatch(/^file:.*\/marketplace\/apps\/kit\/server$/)

    act(() => root.render(<></>))
    expect(del).toHaveBeenCalledWith('/marketplace/apps/kit/lease/lease-1')
  })
})
