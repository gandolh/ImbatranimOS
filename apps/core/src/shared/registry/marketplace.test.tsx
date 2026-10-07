// @vitest-environment jsdom
import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { Gamepad2, Package } from 'lucide-react'
import { APP_REGISTRY } from './registry'
import {
  isMarketplaceApp,
  loadMarketplace,
  marketplaceIcon,
  syncMarketplaceApps,
  type MarketplaceApp,
} from './marketplace'

const get = vi.fn()
vi.mock('../../lib/axios', () => ({
  api: { get: (...args: unknown[]) => get(...args) as unknown },
}))

// Which host a window gets is the registry's decision; the hosts themselves
// have their own tests.
vi.mock('../../modules/marketplace/NativeAppHost', () => ({
  NativeAppHost: ({ app }: { app: MarketplaceApp }) => <p data-host="native">{app.id}</p>,
}))
vi.mock('../../modules/marketplace/SandboxedAppHost', () => ({
  SandboxedAppHost: ({ app }: { app: MarketplaceApp }) => <p data-host="sandboxed">{app.id}</p>,
}))

function app(
  id: string,
  installed: Partial<NonNullable<MarketplaceApp['installed']>> | null,
  extra: Partial<MarketplaceApp> = {}
) {
  return {
    id,
    name: id,
    description: '',
    meta: [],
    type: 'static',
    icon: 'gamepad-2',
    window: { defaultSize: { w: 800, h: 600 }, minSize: { w: 400, h: 300 } },
    capabilities: [],
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
