// @vitest-environment jsdom
import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileText, Gamepad2, Package } from 'lucide-react'
import { APP_REGISTRY } from './registry'
import {
  MARKETPLACE_ICON_NAMES,
  descriptorIdOf,
  isKitApp,
  isMarketplaceApp,
  kitBuildKey,
  loadMarketplace,
  marketplaceIcon,
  rebuildFixesKit,
  syncMarketplaceApps,
  useBuiltInClashes,
  type MarketplaceApp,
} from './marketplace'
import { candidatesFor, resolveOpener, useAssociationStore } from './associations'
import { useAddonStore } from '../store/addonStore'

const get = vi.fn()
vi.mock('../../lib/axios', () => ({
  api: {
    get: (...args: unknown[]) => get(...args) as unknown,
    // The stores this file writes are dotfiles: prefs.ts's debounced flush
    // PUTs them a moment later, sometimes after the test that wrote them
    // (brief 181).
    put: () => Promise.resolve({ data: { written: 0 } }),
  },
}))

// Which host a window gets is the registry's decision; the hosts themselves
// have their own tests.
vi.mock('../../modules/marketplace/NativeAppHost', () => ({
  NativeAppHost: ({ app }: { app: MarketplaceApp }) => <p data-host="native">{app.id}</p>,
}))
vi.mock('../../modules/marketplace/SandboxedAppHost', () => ({
  SandboxedAppHost: ({ app }: { app: MarketplaceApp }) => <p data-host="sandboxed">{app.id}</p>,
}))
const { startKitApp } = vi.hoisted(() => ({ startKitApp: vi.fn() }))
vi.mock('../../modules/marketplace/KitAppHost', () => ({
  KitAppHost: ({ app }: { app: MarketplaceApp }) => <p data-host="kit">{app.id}</p>,
}))
vi.mock('../../modules/marketplace/kitModule', () => ({ startKitApp }))

function app(
  id: string,
  installed: Partial<NonNullable<MarketplaceApp['installed']>> | null,
  extra: Partial<MarketplaceApp> = {}
) {
  return {
    id,
    descriptorId: id,
    descriptorName: id,
    name: id,
    description: '',
    meta: [],
    type: 'static',
    icon: 'gamepad-2',
    window: { defaultSize: { w: 800, h: 600 }, minSize: { w: 400, h: 300 } },
    capabilities: [],
    multiInstance: false,
    opens: [],
    minSystemVersion: 2,
    ref: 'a'.repeat(40),
    runtime: 'native',
    installed: installed && {
      ref: 'a'.repeat(40),
      buildId: 'b1',
      installedAt: 0,
      entryPath: `marketplace/apps/${id}/b/b1/app.mjs`,
      missing: false,
      ...installed,
    },
    job: null,
    server: { state: 'stopped' },
    ...extra,
  } satisfies MarketplaceApp
}

/** A URL app as contract B lists it: sandboxed, with a source and no entryPath. */
function urlApp(id: string, commit = 'c'.repeat(40), missing = false): MarketplaceApp {
  return {
    ...app(id, null),
    runtime: 'sandboxed',
    source: {
      url: 'https://github.com/o/r',
      repo: 'https://github.com/o/r',
      ref: null,
      commit,
      subdir: null,
    },
    // The same buildId across commits, so a re-sync is down to the commit.
    installed: { ref: commit, buildId: 'url', installedAt: 0, missing },
  }
}

/** Render the window component the registry made for `id`, and say which host it used. */
async function hostOf(id: string): Promise<string | null> {
  const config = APP_REGISTRY.find((a) => a.id === id)!
  const Component = config.component
  const node = document.createElement('div')
  const root = createRoot(node)
  await act(async () => {
    root.render(
      <Suspense fallback={null}>
        <Component windowId="w1" />
      </Suspense>
    )
  })
  const host = node.querySelector('[data-host]')?.getAttribute('data-host') ?? null
  act(() => root.unmount())
  return host
}

describe('the marketplace registry (brief 120)', () => {
  const builtIns = APP_REGISTRY.length

  it('adds installed, present apps and nothing else', () => {
    syncMarketplaceApps([app('hollow', {}), app('pending', null), app('gone', { missing: true })])
    expect(APP_REGISTRY.length).toBe(builtIns + 1)
    const hollow = APP_REGISTRY.find((a) => a.id === 'hollow')!
    expect(hollow.defaultSize).toEqual({ width: 800, height: 600 })
    expect(hollow.meta).toContain('marketplace')
    expect(isMarketplaceApp('hollow')).toBe(true)
    expect(isMarketplaceApp('pending')).toBe(false)
  })

  it('replaces the previous set rather than adding to it', () => {
    syncMarketplaceApps([app('hollow', {})])
    syncMarketplaceApps([app('citadel', {})])
    expect(APP_REGISTRY.some((a) => a.id === 'hollow')).toBe(false)
    expect(APP_REGISTRY.filter((a) => a.id === 'citadel')).toHaveLength(1)
    expect(APP_REGISTRY.length).toBe(builtIns + 1)
    syncMarketplaceApps([])
    expect(APP_REGISTRY.length).toBe(builtIns)
  })

  it('never lets a catalog entry shadow a built-in app', () => {
    const settingsBefore = APP_REGISTRY.find((a) => a.id === 'settings')
    syncMarketplaceApps([app('settings', {})])
    expect(APP_REGISTRY.filter((a) => a.id === 'settings')).toEqual([settingsBefore])
    expect(isMarketplaceApp('settings')).toBe(false)
  })
})

describe('apps from a URL in the registry (brief 158)', () => {
  const builtIns = APP_REGISTRY.length

  it('adds an installed URL app though it has no entryPath, and opens it in the sandboxed host', async () => {
    syncMarketplaceApps([urlApp('x-0123456789ab'), app('hollow', {})])
    expect(isMarketplaceApp('x-0123456789ab')).toBe(true)
    expect(await hostOf('x-0123456789ab')).toBe('sandboxed')
    expect(await hostOf('hollow')).toBe('native')
    syncMarketplaceApps([])
  })

  it('reads a listing without runtime as native', async () => {
    const legacy: Partial<MarketplaceApp> = app('orbits', {})
    delete legacy.runtime
    syncMarketplaceApps([legacy as MarketplaceApp])
    expect(await hostOf('orbits')).toBe('native')
    syncMarketplaceApps([])
  })

  it('skips a URL app whose files are missing, and a native app with nothing to import', () => {
    syncMarketplaceApps([
      urlApp('x-aaaaaaaaaaaa', 'c'.repeat(40), true),
      app('broken', { entryPath: undefined }),
    ])
    expect(APP_REGISTRY.length).toBe(builtIns)
    expect(isMarketplaceApp('x-aaaaaaaaaaaa')).toBe(false)
    expect(isMarketplaceApp('broken')).toBe(false)
  })

  it('never lets a URL app shadow a built-in app', () => {
    const settingsBefore = APP_REGISTRY.find((a) => a.id === 'settings')
    syncMarketplaceApps([urlApp('settings')])
    expect(APP_REGISTRY.filter((a) => a.id === 'settings')).toEqual([settingsBefore])
    expect(isMarketplaceApp('settings')).toBe(false)
  })

  it("re-syncs when a URL app's commit moves, and not when nothing runnable changed", async () => {
    get.mockResolvedValueOnce({
      data: { apps: [urlApp('x-bbbbbbbbbbbb', '1'.repeat(40))], problems: [] },
    })
    await loadMarketplace()
    const first = APP_REGISTRY.find((a) => a.id === 'x-bbbbbbbbbbbb')
    expect(first).toBeDefined()

    get.mockResolvedValueOnce({
      data: { apps: [urlApp('x-bbbbbbbbbbbb', '1'.repeat(40))], problems: [] },
    })
    await loadMarketplace()
    expect(APP_REGISTRY.find((a) => a.id === 'x-bbbbbbbbbbbb')).toBe(first)

    get.mockResolvedValueOnce({
      data: { apps: [urlApp('x-bbbbbbbbbbbb', '2'.repeat(40))], problems: [] },
    })
    await loadMarketplace()
    const second = APP_REGISTRY.find((a) => a.id === 'x-bbbbbbbbbbbb')
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    syncMarketplaceApps([])
  })
})

describe('marketplaceIcon', () => {
  // The name comes from an unreviewed app's manifest (brief 158).
  it('looks up a listed icon', () => {
    expect(marketplaceIcon('gamepad-2')).toBe(Gamepad2)
    expect(marketplaceIcon('package')).toBe(Package)
  })

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'nope', ''])(
    'gives the package icon for %j',
    (name) => {
      expect(marketplaceIcon(name)).toBe(Package)
    }
  )

  it('renders an app whose manifest names "constructor" with the package icon', async () => {
    syncMarketplaceApps([{ ...urlApp('x-cccccccccccc'), icon: 'constructor' }])
    const config = APP_REGISTRY.find((a) => a.id === 'x-cccccccccccc')!
    expect(config.icon).toBe(Package)
    const node = document.createElement('div')
    const root = createRoot(node)
    const Icon = config.icon
    act(() => root.render(<Icon size={15} />))
    expect(node.querySelector('svg')).not.toBeNull()
    act(() => root.unmount())
    syncMarketplaceApps([])
  })
})

/** An app of a two-app suite (brief 162), installed. */
function suiteApp(id: string, extra: Partial<MarketplaceApp> = {}): MarketplaceApp {
  return app(
    id,
    { entryPath: `marketplace/apps/office/b/b1/${id}/app.mjs` },
    { descriptorId: 'office', descriptorName: 'Office', ...extra }
  )
}

describe('several apps from one descriptor (brief 162)', () => {
  beforeEach(() => {
    localStorage.clear()
    useAssociationStore.setState({ overrides: {} })
    useAddonStore.setState({ disabled: [] })
    syncMarketplaceApps([])
  })

  it('adds every installed app of a suite, each with its own window rule', () => {
    syncMarketplaceApps([
      suiteApp('office-docs', { multiInstance: true }),
      suiteApp('office-sheets'),
    ])
    expect(isMarketplaceApp('office-docs')).toBe(true)
    expect(isMarketplaceApp('office-sheets')).toBe(true)
    expect(APP_REGISTRY.find((a) => a.id === 'office-docs')?.multiInstance).toBe(true)
    expect(APP_REGISTRY.find((a) => a.id === 'office-sheets')?.multiInstance).toBe(false)
    syncMarketplaceApps([])
  })

  it('keeps one window for a listing that says nothing about it', () => {
    const legacy: Partial<MarketplaceApp> = app('orbits', {})
    delete legacy.multiInstance
    delete legacy.opens
    delete legacy.descriptorId
    syncMarketplaceApps([legacy as MarketplaceApp])
    const config = APP_REGISTRY.find((a) => a.id === 'orbits')!
    expect(config.multiInstance).toBe(false)
    expect(config.opens).toBeUndefined()
    expect(descriptorIdOf(legacy as MarketplaceApp)).toBe('orbits')
    syncMarketplaceApps([])
  })

  it('reads the routes’ id from descriptorId', () => {
    expect(descriptorIdOf(suiteApp('office-docs'))).toBe('office')
    expect(descriptorIdOf(app('hollow', {}))).toBe('hollow')
  })

  it('offers a marketplace app in Open With after the built-in that claims the type', () => {
    // Markdown, not an office type: the built-in Docs, Slides, Sheets and PDF
    // apps leave for the suite (briefs 164-167), Markdown Editor stays.
    syncMarketplaceApps([suiteApp('office-notes', { opens: ['md'] })])
    expect(APP_REGISTRY.find((a) => a.id === 'office-notes')?.opens).toEqual(['md'])
    const ids = candidatesFor('notes.md').map((c) => c.appId)
    expect(ids).toContain('markdown-editor')
    expect(ids.indexOf('office-notes')).toBeGreaterThan(ids.indexOf('markdown-editor'))
    // The built-in stays the default, until the owner picks the other.
    expect(resolveOpener('notes.md').appId).toBe('markdown-editor')
    useAssociationStore.getState().setDefault('md', 'office-notes')
    expect(resolveOpener('notes.md')).toEqual({ appId: 'office-notes', reason: 'override' })
    syncMarketplaceApps([])
  })

  it('makes the suite the only opener of .docx once the built-in Docs is gone (brief 164)', () => {
    expect(resolveOpener('letter.docx')).toEqual({ appId: '', reason: 'none' })
    syncMarketplaceApps([suiteApp('office-docs', { opens: ['docx'] })])
    expect(resolveOpener('letter.docx')).toEqual({ appId: 'office-docs', reason: 'declared' })
    syncMarketplaceApps([])
  })

  it('drops a disabled marketplace app out of Open With, and only that one', () => {
    syncMarketplaceApps([
      suiteApp('office-docs', { opens: ['docx'] }),
      suiteApp('office-writer', { opens: ['docx'] }),
    ])
    useAddonStore.setState({ disabled: ['office-docs'] })
    const ids = candidatesFor('letter.docx').map((c) => c.appId)
    expect(ids).not.toContain('office-docs')
    expect(ids).toContain('office-writer')
    syncMarketplaceApps([])
  })

  it('gives an app that opens nothing no opens at all, so "Show all" leaves it out', () => {
    syncMarketplaceApps([suiteApp('office-sheets', { opens: [] })])
    expect(APP_REGISTRY.find((a) => a.id === 'office-sheets')?.opens).toBeUndefined()
    syncMarketplaceApps([])
  })

  it('notes the listed ids a built-in app already has, installed or not', () => {
    const seen: string[][] = []
    function Probe() {
      seen.push(useBuiltInClashes())
      return null
    }
    const node = document.createElement('div')
    const root = createRoot(node)
    act(() => root.render(<Probe />))
    act(() => syncMarketplaceApps([suiteApp('settings'), app('notepad', null), suiteApp('ok')]))
    expect(seen.at(-1)).toEqual(['settings', 'notepad'])
    expect(isMarketplaceApp('settings')).toBe(false)
    expect(isMarketplaceApp('ok')).toBe(true)
    act(() => syncMarketplaceApps([]))
    expect(seen.at(-1)).toEqual([])
    act(() => root.unmount())
  })
})

describe('the icons committed descriptors name (brief 162)', () => {
  // vitest runs from apps/core.
  const catalog = join(process.cwd(), '..', '..', 'marketplace')
  const files = readdirSync(catalog).filter((f) => f.endsWith('.json'))

  it('reads the committed catalog', () => {
    expect(files).toContain('hollow.json')
  })

  it.each(files)('%s names only icons the desktop has', (file) => {
    const d = JSON.parse(readFileSync(join(catalog, file), 'utf8')) as {
      icon?: string
      apps?: { icon?: string }[]
    }
    const icons = d.apps ? d.apps.map((a) => a.icon ?? 'package') : [d.icon ?? 'package']
    for (const icon of icons) expect(MARKETPLACE_ICON_NAMES).toContain(icon)
  })

  it('has the office set', () => {
    for (const name of [
      'file-text',
      'file-pen',
      'table',
      'sheet',
      'presentation',
      'pen-tool',
      'drafting-compass',
      'ruler',
      'briefcase',
    ]) {
      expect(MARKETPLACE_ICON_NAMES).toContain(name)
      expect(marketplaceIcon(name)).not.toBe(Package)
    }
    expect(marketplaceIcon('file-text')).toBe(FileText)
  })
})

describe('kit apps in the registry (brief 163)', () => {
  beforeEach(() => syncMarketplaceApps([]))

  it('opens an app with a shared kit version in the kit host, and one without in the mount host', async () => {
    const legacy: Partial<MarketplaceApp> = app('orbits', {})
    delete legacy.sharedKit
    syncMarketplaceApps([
      suiteApp('office-docs', { sharedKit: 1 }),
      app('hollow', {}, { sharedKit: null }),
      legacy as MarketplaceApp,
    ])
    expect(await hostOf('office-docs')).toBe('kit')
    // A mismatch is still the kit host's to refuse, in its window.
    syncMarketplaceApps([suiteApp('office-docs', { sharedKit: 99 })])
    expect(await hostOf('office-docs')).toBe('kit')
    syncMarketplaceApps([app('hollow', {}, { sharedKit: null }), legacy as MarketplaceApp])
    expect(await hostOf('hollow')).toBe('native')
    expect(await hostOf('orbits')).toBe('native')
    syncMarketplaceApps([])
  })

  it('offers a rebuild only when the catalog now names this desktop’s kit (brief 176)', () => {
    const built = (sharedKit: number, catalogSharedKit?: number | null) =>
      suiteApp('office-docs', { sharedKit, catalogSharedKit })
    // Built for kit 1, the catalog moved to 2, the desktop has 2.
    expect(rebuildFixesKit(built(1, 2), 2)).toBe(true)
    // The catalog still names kit 1: a rebuild would make the same mismatch.
    expect(rebuildFixesKit(built(1, 1), 2)).toBe(false)
    // A backend from before brief 176 says nothing about the catalog: unknown.
    expect(rebuildFixesKit(built(1), 2)).toBe(false)
    // Nothing to fix.
    expect(rebuildFixesKit(built(2, 2), 2)).toBe(false)
    // Not installed, a mount app, a URL app.
    expect(rebuildFixesKit({ ...built(1, 2), installed: null }, 2)).toBe(false)
    expect(rebuildFixesKit(app('hollow', {}, { sharedKit: null, catalogSharedKit: null }), 2)).toBe(
      false
    )
    expect(
      rebuildFixesKit({ ...urlApp('x-0123456789ab'), sharedKit: 1, catalogSharedKit: 2 }, 2)
    ).toBe(false)
  })

  it('never takes a URL app for a kit app', () => {
    expect(isKitApp({ ...urlApp('x-0123456789ab'), sharedKit: 1 })).toBe(false)
    expect(isKitApp(suiteApp('office-docs', { sharedKit: 1 }))).toBe(true)
    expect(isKitApp(suiteApp('office-docs', { sharedKit: null }))).toBe(false)
  })

  it("starts a kit app's entry as its window opens, and no other host's (brief 182)", async () => {
    const preloads = () =>
      [...document.head.querySelectorAll('link[rel="modulepreload"]')].map((l) =>
        l.getAttribute('href')
      )
    // The windows earlier tests opened left theirs: jsdom never loads a link.
    document.head.querySelectorAll('link').forEach((l) => l.remove())
    syncMarketplaceApps([
      suiteApp('office-docs', { sharedKit: 1 }),
      app('hollow', {}, { sharedKit: null }),
    ])
    // Listed and in the registry, but no window yet: nothing fetched.
    expect(preloads()).toEqual([])
    expect(await hostOf('hollow')).toBe('native')
    expect(preloads()).toEqual([])
    startKitApp.mockClear()
    expect(await hostOf('office-docs')).toBe('kit')
    expect(preloads()).toEqual([
      new URL('/api/marketplace/apps/office/b/b1/office-docs/app.mjs', location.href).href,
    ])
    // And the import itself starts as the host's chunk arrives, before it mounts.
    expect(startKitApp).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'office-docs' })
    )
    document.head.querySelectorAll('link').forEach((l) => l.remove())
    syncMarketplaceApps([])
  })

  /** A stylesheet link in the page, as the kit host adds it. */
  const link = (build: string, href: string) => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.setAttribute('data-kit-build', build)
    l.setAttribute('href', href)
    document.head.append(l)
    return l
  }
  const links = () =>
    [...document.head.querySelectorAll('link[data-kit-build]')].map((l) =>
      l.getAttribute('data-kit-build')
    )

  it("keeps a live build's stylesheets and removes one that left, on every sync", () => {
    link('office@b1', '/api/marketplace/apps/office/b/b1/kit.css')
    link('office@b0', '/api/marketplace/apps/office/b/b0/kit.css')
    link('gone@b1', '/api/marketplace/apps/gone/b/b1/kit.css')
    syncMarketplaceApps([
      suiteApp('office-docs', { sharedKit: 1 }),
      suiteApp('office-sheets', { sharedKit: 1 }),
    ])
    expect(kitBuildKey(suiteApp('office-docs'))).toBe('office@b1')
    expect(links()).toEqual(['office@b1'])
    // Uninstalled: the listing has it, not installed.
    syncMarketplaceApps([app('office-docs', null, { descriptorId: 'office', sharedKit: 1 })])
    expect(links()).toEqual([])
  })
})
