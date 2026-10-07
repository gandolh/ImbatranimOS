import { lazy, type ComponentType } from 'react'
import { create } from 'zustand'
import {
  Castle,
  Dices,
  Gamepad2,
  Ghost,
  Joystick,
  Map as MapIcon,
  Package,
  Puzzle,
  Rocket,
  Sprout,
  Swords,
  Trophy,
} from 'lucide-react'
import { api } from '../../lib/axios'
import { APP_REGISTRY, type AppConfig } from './registry'

/**
 * The second registry beside `manifest.ts` (brief 120): apps installed from
 * the marketplace catalog. `manifest.ts` stays the one place built-in add-ons
 * are composed; these arrive at runtime, from `GET /marketplace`, and are
 * spliced into the same `APP_REGISTRY` array so the launcher, the add-on
 * toggles, intents and the window container treat them like any other app.
 *
 * `APP_REGISTRY` is read imperatively all over the shell, so it is mutated in
 * place and {@link useRegistryVersion} tells the components that render from
 * it to look again.
 */

/**
 * One app as the backend lists it (`MarketplaceApp` there): a catalog entry
 * (brief 120), or an app installed from a URL (brief 158).
 */
export type MarketplaceApp = {
  id: string
  name: string
  description: string
  meta: string[]
  type: 'static' | 'service'
  icon: string
  window: { defaultSize: { w: number; h: number }; minSize: { w: number; h: number } }
  capabilities: Capability[]
  minSystemVersion: number
  ref: string
  /**
   * How the desktop runs it: `native` imports its module into this page (a
   * reviewed catalog app); `sandboxed` runs it in an opaque-origin iframe (an
   * app from a URL). A backend from before brief 158 sends none: read that
   * as native.
   */
  runtime: 'native' | 'sandboxed'
  /** Where a URL app came from, as resolved at install. Absent for a catalog app. */
  source?: AppSource
  installed: {
    ref: string
    buildId: string
    installedAt: number
    /** What the desktop imports, relative to the API's base. A URL app has none. */
    entryPath?: string
    missing: boolean
  } | null
  job: { state: 'queued' | 'fetching' | 'building' | 'failed'; reason?: string } | null
  server:
    | { state: 'stopped' }
    | { state: 'starting' | 'up'; port: number }
    | { state: 'crashed'; reason: string }
}

export type Capability = 'fs' | 'http' | 'intents' | 'notify' | 'shortcuts' | 'schedule'

/** A URL app's source (brief 158, contract B's `Inspection['source']`). */
export type AppSource = {
  /** Normalized, e.g. `https://github.com/o/r/tree/main/sub`. */
  url: string
  /** `https://github.com/o/r`. */
  repo: string
  /** The branch or tag asked for; null = the default branch. */
  ref: string | null
  /** The commit installed, 40 hex. */
  commit: string
  subdir: string | null
}

/** True for an app the desktop runs in the iframe sandbox. A missing `runtime` is native. */
export function isSandboxed(app: Pick<MarketplaceApp, 'runtime'>): boolean {
  return app.runtime === 'sandboxed'
}

export type MarketplaceListing = {
  apps: MarketplaceApp[]
  /**
   * Catalog files that could not be read, and installed apps whose stored
   * record is damaged; the latter carry `appId` so the pane can uninstall them.
   */
  problems: { file: string; problem: string; appId?: string }[]
}

type IconComponent = AppConfig['icon']

/**
 * The icons a descriptor may name. A fixed list rather than all of lucide:
 * the whole icon map is hundreds of KB in the eager bundle for a field most
 * descriptors leave at its default.
 */
const ICONS: Record<string, IconComponent> = {
  package: Package,
  'gamepad-2': Gamepad2,
  joystick: Joystick,
  puzzle: Puzzle,
  swords: Swords,
  sprout: Sprout,
  castle: Castle,
  rocket: Rocket,
  dices: Dices,
  ghost: Ghost,
  trophy: Trophy,
  map: MapIcon,
}

/**
 * The icon a descriptor or manifest names, or the package icon. `name` comes
 * from an app's own manifest, so look it up as an own key only: `ICONS[name]`
 * would hand back `Object` for "constructor" (and a function for "toString"),
 * and rendering that as a component crashes the pane.
 */
export function marketplaceIcon(name: string): IconComponent {
  return Object.hasOwn(ICONS, name) ? ICONS[name] : Package
}

const useRegistryStore = create<{ version: number; ids: string[] }>(() => ({
  version: 0,
  ids: [],
}))

/** Subscribe a component to marketplace apps arriving in or leaving `APP_REGISTRY`. */
export function useRegistryVersion(): number {
  return useRegistryStore((s) => s.version)
}

/** True when `appId` is a marketplace app rather than a built-in add-on. */
export function isMarketplaceApp(appId: string): boolean {
  return useRegistryStore.getState().ids.includes(appId)
}

function toAppConfig(app: MarketplaceApp): AppConfig {
  const component = lazy(async () => {
    // The host is its own chunk, and the game's code is fetched only when a
    // window opens: nothing of either is in the eager bundle (brief 33).
    if (isSandboxed(app)) {
      const { SandboxedAppHost } = await import('../../modules/marketplace/SandboxedAppHost')
      const Host: ComponentType<{ windowId: string }> = ({ windowId }) => (
        <SandboxedAppHost windowId={windowId} app={app} />
      )
      return { default: Host }
    }
    const { NativeAppHost } = await import('../../modules/marketplace/NativeAppHost')
    const Host: ComponentType<{ windowId: string }> = ({ windowId }) => (
      <NativeAppHost windowId={windowId} app={app} />
    )
    return { default: Host }
  })
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    meta: [...app.meta, 'marketplace'],
    icon: marketplaceIcon(app.icon),
    component,
    // One window per game: a second would be a second copy of its world, and
    // a service app's server is shared between them anyway.
    multiInstance: false,
    defaultSize: { width: app.window.defaultSize.w, height: app.window.defaultSize.h },
    minSize: { width: app.window.minSize.w, height: app.window.minSize.h },
  }
}

/**
 * Installed with its files present, and something to run: a native app needs
 * the module path; a sandboxed one is served by token and has none.
 */
function isRunnable(app: MarketplaceApp): boolean {
  if (!app.installed || app.installed.missing) return false
  return isSandboxed(app) || typeof app.installed.entryPath === 'string'
}

/**
 * Put the installed, runnable apps of a listing into `APP_REGISTRY`, replacing
 * whatever the previous listing put there. A built-in id always wins: a
 * marketplace app cannot shadow Settings or the Terminal.
 */
export function syncMarketplaceApps(apps: MarketplaceApp[]): void {
  const previous = new Set(useRegistryStore.getState().ids)
  for (let i = APP_REGISTRY.length - 1; i >= 0; i--) {
    if (previous.has(APP_REGISTRY[i].id)) APP_REGISTRY.splice(i, 1)
  }
  const builtIn = new Set(APP_REGISTRY.map((a) => a.id))
  const added: string[] = []
  for (const app of apps) {
    if (!isRunnable(app) || builtIn.has(app.id) || added.includes(app.id)) continue
    APP_REGISTRY.push(toAppConfig(app))
    added.push(app.id)
  }
  useRegistryStore.setState((s) => ({ version: s.version + 1, ids: added }))
}

/** Fetch the catalog and sync the registry. Resolves the listing for the pane. */
export async function loadMarketplace(): Promise<MarketplaceListing> {
  const { data } = await api.get<MarketplaceListing>('/marketplace')
  // An install that only changed its job state leaves the registry alone: a
  // fresh AppConfig would remount every open window of the app. A URL app's
  // update is a new commit (and revokes its open windows' tokens), so that
  // remounts them.
  const key = (list: MarketplaceApp[]) =>
    list
      .filter(isRunnable)
      .map(
        (a) => `${a.id}@${a.runtime ?? 'native'}@${a.installed?.buildId}@${a.source?.commit ?? ''}`
      )
      .join(',')
  if (key(data.apps) !== lastKey) {
    lastKey = key(data.apps)
    syncMarketplaceApps(data.apps)
  }
  return data
}

let lastKey: string | null = null
