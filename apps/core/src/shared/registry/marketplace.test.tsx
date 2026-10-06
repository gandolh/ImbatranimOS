import { describe, expect, it } from 'vitest'
import { APP_REGISTRY } from './registry'
import { isMarketplaceApp, syncMarketplaceApps, type MarketplaceApp } from './marketplace'

function app(id: string, installed: Partial<NonNullable<MarketplaceApp['installed']>> | null) {
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
  } satisfies MarketplaceApp
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
