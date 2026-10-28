// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetStartupForTest, runStartupApps, startupCandidates, startupHasRun } from './startup'
import { useStartupStore } from '../store/startupStore'
import { useAddonStore } from '../store/addonStore'
import { useWindowStore } from '../store/windowStore'
import { DOTFILE_KEYS } from '../../lib/prefs'
import { APP_REGISTRY } from '../registry/registry'

/**
 * Brief 82 — startup apps.
 *
 * The interesting assertions are the two "does NOT open" cases. Brief 82 was
 * written believing brief 49 had deleted the layout restore; it had not, so
 * "open the list once per session" as literally specified would re-open
 * everything on top of the windows a reload just brought back.
 */

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetStartupForTest()
  useStartupStore.setState({ apps: [] })
  useAddonStore.setState({ disabled: [] })
  useWindowStore.setState({ windows: [], nextZIndex: 1 })
})

describe('the list is a dotfile', () => {
  it('its persist key is registered in DOTFILE_KEYS', () => {
    // Same trap brief 81 fell into: a store wired to `prefsStorage` whose key is
    // not in this list persists to localStorage only, so "my startup apps follow
    // me" silently means "in this browser".
    expect(DOTFILE_KEYS as readonly string[]).toContain('imbatranimos:startup')
  })
})

describe('which apps are candidates', () => {
  it('keeps the configured order rather than registry order', () => {
    useStartupStore.setState({ apps: ['calculator', 'terminal'] })
    expect(startupCandidates()).toEqual(['calculator', 'terminal'])
    useStartupStore.setState({ apps: ['terminal', 'calculator'] })
    expect(startupCandidates()).toEqual(['terminal', 'calculator'])
  })

  it('skips an app the user disabled, rather than resurrecting it', () => {
    useStartupStore.setState({ apps: ['calculator', 'terminal'] })
    useAddonStore.setState({ disabled: ['calculator'] })
    expect(startupCandidates()).toEqual(['terminal'])
  })

  it('skips an id the registry no longer has', () => {
    // An app removed from the tree must not leave a boot that never completes.
    useStartupStore.setState({ apps: ['an-app-that-was-removed', 'terminal'] })
    expect(startupCandidates()).toEqual(['terminal'])
  })
})

describe('running the set', async () => {
  it('opens the configured apps, in order', async () => {
    useStartupStore.setState({ apps: ['terminal', 'calculator'] })
    expect(await runStartupApps()).toEqual(['terminal', 'calculator'])
    expect(useWindowStore.getState().windows.map((w) => w.appId)).toEqual([
      'terminal',
      'calculator',
    ])
  })

  it('leaves the last one focused, which is why the order is a list', async () => {
    useStartupStore.setState({ apps: ['terminal', 'calculator'] })
    await runStartupApps()
    const wins = useWindowStore.getState().windows
    const top = wins.reduce((a, b) => (b.zIndex > a.zIndex ? b : a))
    expect(top.appId).toBe('calculator')
  })

  it('does NOT run a second time in the same tab, even with an empty desktop', async () => {
    // Close everything, reload: the set must not come back. Otherwise "close it"
    // is impossible for any app on the list.
    useStartupStore.setState({ apps: ['terminal'] })
    expect(await runStartupApps()).toEqual(['terminal'])
    useWindowStore.setState({ windows: [] })
    expect(await runStartupApps()).toEqual([])
    expect(useWindowStore.getState().windows).toHaveLength(0)
  })

  it('does NOT run when a layout was restored — the reload case brief 82 missed', async () => {
    // Brief 49 kept the restore and moved it to sessionStorage, so a reload comes
    // back with its windows. Re-running the set here would double every
    // multi-instance app and steal focus on every single reload.
    useStartupStore.setState({ apps: ['terminal', 'calculator'] })
    useWindowStore
      .getState()
      .openWindow('notepad', 'Notepad', { width: 400, height: 300 }, { width: 200, height: 150 })
    expect(await runStartupApps()).toEqual([])
    expect(useWindowStore.getState().windows.map((w) => w.appId)).toEqual(['notepad'])
  })

  it('marks the tab even when the list is empty, so adding one mid-session waits for the next boot', async () => {
    expect(await runStartupApps()).toEqual([])
    expect(startupHasRun()).toBe(true)
  })

  it('opens nothing at all when nothing is configured', async () => {
    expect(await runStartupApps()).toEqual([])
    expect(useWindowStore.getState().windows).toHaveLength(0)
  })

  it('skips a disabled entry without dropping the ones after it', async () => {
    useStartupStore.setState({ apps: ['calculator', 'terminal'] })
    useAddonStore.setState({ disabled: ['calculator'] })
    expect(await runStartupApps()).toEqual(['terminal'])
  })
})

describe('a Marketplace app in the list (brief 183)', () => {
  // A Marketplace app joins APP_REGISTRY only when the first listing arrives,
  // after the boot effect has run. These stand in for that listing.
  function listing() {
    let settle!: (ok: boolean) => void
    const promise = new Promise<void>((resolve, reject) => {
      settle = (ok) => (ok ? resolve() : reject(new Error('listing failed')))
    })
    return { promise, settle }
  }
  function register(id: string) {
    const calculator = APP_REGISTRY.find((a) => a.id === 'calculator')!
    APP_REGISTRY.push({ ...calculator, id, name: id })
  }

  afterEach(() => {
    for (let i = APP_REGISTRY.length - 1; i >= 0; i--) {
      if (APP_REGISTRY[i].id.startsWith('market-')) APP_REGISTRY.splice(i, 1)
    }
  })

  const appIds = () => useWindowStore.getState().windows.map((w) => w.appId)

  it('waits for the listing, then opens the whole set in order, the last in front', async () => {
    useStartupStore.setState({ apps: ['terminal', 'market-docs', 'calculator'] })
    const first = listing()
    const run = runStartupApps(first.promise)
    // Nothing yet: the built-ins wait with the Marketplace app.
    expect(appIds()).toEqual([])
    register('market-docs')
    first.settle(true)
    expect(await run).toEqual(['terminal', 'market-docs', 'calculator'])
    expect(appIds()).toEqual(['terminal', 'market-docs', 'calculator'])
    const wins = useWindowStore.getState().windows
    expect(wins.reduce((a, b) => (b.zIndex > a.zIndex ? b : a)).appId).toBe('calculator')
  })

  it('still opens the built-ins when the listing fails', async () => {
    useStartupStore.setState({ apps: ['market-docs', 'terminal'] })
    const first = listing()
    const run = runStartupApps(first.promise)
    first.settle(false)
    expect(await run).toEqual(['terminal'])
  })

  it('skips an app the listing never brought', async () => {
    useStartupStore.setState({ apps: ['terminal', 'market-gone'] })
    const first = listing()
    const run = runStartupApps(first.promise)
    first.settle(true)
    expect(await run).toEqual(['terminal'])
  })

  it('opens at once, without waiting, when every listed app is registered', async () => {
    useStartupStore.setState({ apps: ['terminal'] })
    const first = listing()
    const run = runStartupApps(first.promise)
    expect(appIds()).toEqual(['terminal'])
    expect(await run).toEqual(['terminal'])
  })

  it('does not wait for a disabled Marketplace app', async () => {
    useStartupStore.setState({ apps: ['terminal', 'market-docs'] })
    useAddonStore.setState({ disabled: ['market-docs'] })
    void runStartupApps(listing().promise)
    expect(appIds()).toEqual(['terminal'])
  })

  it('opens nothing after the listing when a layout was restored', async () => {
    useStartupStore.setState({ apps: ['market-docs'] })
    useWindowStore
      .getState()
      .openWindow('notepad', 'Notepad', { width: 400, height: 300 }, { width: 200, height: 150 })
    const first = listing()
    const run = runStartupApps(first.promise)
    register('market-docs')
    first.settle(true)
    expect(await run).toEqual([])
    expect(appIds()).toEqual(['notepad'])
  })

  it('opens nothing after the listing in a tab that already ran', async () => {
    useStartupStore.setState({ apps: ['terminal'] })
    expect(await runStartupApps()).toEqual(['terminal'])
    useWindowStore.setState({ windows: [] })
    useStartupStore.setState({ apps: ['market-docs'] })
    const second = listing()
    const run = runStartupApps(second.promise)
    register('market-docs')
    second.settle(true)
    expect(await run).toEqual([])
    expect(appIds()).toEqual([])
  })
})

describe('the store', () => {
  it('toggles without disturbing the order of the rest', () => {
    const { toggle } = useStartupStore.getState()
    toggle('a')
    toggle('b')
    toggle('c')
    toggle('b')
    expect(useStartupStore.getState().apps).toEqual(['a', 'c'])
  })

  it('moves an entry one place, and refuses to fall off either end', () => {
    useStartupStore.setState({ apps: ['a', 'b', 'c'] })
    const { move } = useStartupStore.getState()
    move('c', -1)
    expect(useStartupStore.getState().apps).toEqual(['a', 'c', 'b'])
    move('a', -1)
    expect(useStartupStore.getState().apps).toEqual(['a', 'c', 'b'])
    move('b', 1)
    expect(useStartupStore.getState().apps).toEqual(['a', 'c', 'b'])
  })

  it('de-duplicates a snapshot, because two Notepads are one startup entry', () => {
    useStartupStore.getState().setApps(['notepad', 'terminal', 'notepad'])
    expect(useStartupStore.getState().apps).toEqual(['notepad', 'terminal'])
  })
})
