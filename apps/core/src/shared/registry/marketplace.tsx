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

/** One catalog entry as the backend lists it (`MarketplaceApp` there). */
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
  installed: {
    ref: string
    buildId: string
    installedAt: number
    entryPath: string
    missing: boolean
  } | null
  job: { state: 'queued' | 'fetching' | 'building' | 'failed'; reason?: string } | null
  server:
    | { state: 'stopped' }
    | { state: 'starting' | 'up'; port: number }
    | { state: 'crashed'; reason: string }
}

export type Capability = 'fs' | 'http' | 'intents' | 'notify' | 'shortcuts' | 'schedule'

export type MarketplaceListing = {
  apps: MarketplaceApp[]
  problems: { file: string; problem: string }[]
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

export function marketplaceIcon(name: string): IconComponent {
  return ICONS[name] ?? Package
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
 * Put the installed, runnable apps of a listing into `APP_REGISTRY`, replacing
 * whatever the previous listing put there. A built-in id always wins: a
 * catalog entry cannot shadow Settings or the Terminal.
 */
export function syncMarketplaceApps(apps: MarketplaceApp[]): void {
  const previous = new Set(useRegistryStore.getState().ids)
  for (let i = APP_REGISTRY.length - 1; i >= 0; i--) {
    if (previous.has(APP_REGISTRY[i].id)) APP_REGISTRY.splice(i, 1)
  }
  const builtIn = new Set(APP_REGISTRY.map((a) => a.id))
  const added: string[] = []
  for (const app of apps) {
    if (!app.installed || app.installed.missing || builtIn.has(app.id)) continue
    APP_REGISTRY.push(toAppConfig(app))
    added.push(app.id)
  }
  useRegistryStore.setState((s) => ({ version: s.version + 1, ids: added }))
}

/** Fetch the catalog and sync the registry. Resolves the listing for the pane. */
export async function loadMarketplace(): Promise<MarketplaceListing> {
  const { data } = await api.get<MarketplaceListing>('/marketplace')
  // An install that only changed its job state leaves the registry alone: a
  // fresh AppConfig would remount every open window of the app.
  const key = (list: MarketplaceApp[]) =>
    list
      .filter((a) => a.installed && !a.installed.missing)
      .map((a) => `${a.id}@${a.installed?.buildId}`)
      .join(',')
  if (key(data.apps) !== lastKey) {
    lastKey = key(data.apps)
    syncMarketplaceApps(data.apps)
  }
  return data
}

let lastKey: string | null = null
