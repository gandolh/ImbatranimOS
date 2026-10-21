import { lazy, type ComponentType } from 'react'
import { create } from 'zustand'
import {
  Briefcase,
  Castle,
  Dices,
  DraftingCompass,
  FilePen,
  FileText,
  Gamepad2,
  Ghost,
  Joystick,
  Map as MapIcon,
  Package,
  PenTool,
  Presentation,
  Puzzle,
  Rocket,
  Ruler,
  Sheet,
  Sprout,
  Swords,
  Table,
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
 * One app as the backend lists it (`MarketplaceApp` there): an app of a
 * catalog descriptor (brief 120; several to a descriptor since brief 162), or
 * an app installed from a URL (brief 158).
 */
export type MarketplaceApp = {
  id: string
  /**
   * The descriptor that installs it (brief 162), which the routes keyed by
   * `:id` take: install, uninstall, log, lease, server. Equal to `id` for a
   * one-app descriptor and a URL app. Read it with {@link descriptorIdOf}.
   */
  descriptorId: string
  /** The descriptor's name: a suite's heading in the pane. `name` for a one-app descriptor. */
  descriptorName: string
  name: string
  description: string
  meta: string[]
  type: 'static' | 'service'
  icon: string
  window: { defaultSize: { w: number; h: number }; minSize: { w: number; h: number } }
  capabilities: Capability[]
  /** A second launch opens a second window. False for games, which say nothing. */
  multiInstance: boolean
  /** File types it offers to open, after the built-in apps that claim them. */
  opens: string[]
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

/**
 * The descriptor id an app's routes take. A backend from before brief 162
 * sends none, and there every app was its own descriptor.
 */
export function descriptorIdOf(app: Pick<MarketplaceApp, 'id' | 'descriptorId'>): string {
  return app.descriptorId ?? app.id
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
 * descriptors leave at its default. A test fails when a committed descriptor
 * names one that is not here (brief 162), so none falls back silently.
 */
const ICONS: Record<string, IconComponent> = {
  package: Package,
  // Games (brief 120).
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
  // Office (brief 162).
  'file-text': FileText,
  'file-pen': FilePen,
  table: Table,
  sheet: Sheet,
  presentation: Presentation,
  'pen-tool': PenTool,
  'drafting-compass': DraftingCompass,
  ruler: Ruler,
  briefcase: Briefcase,
}

/** The icon names a descriptor may use, for the descriptor check and the docs. */
export const MARKETPLACE_ICON_NAMES: readonly string[] = Object.keys(ICONS)

/**
 * The icon a descriptor or manifest names, or the package icon. `name` comes
 * from an app's own manifest, so look it up as an own key only: `ICONS[name]`
 * would hand back `Object` for "constructor" (and a function for "toString"),
 * and rendering that as a component crashes the pane.
 */
export function marketplaceIcon(name: string): IconComponent {
  return Object.hasOwn(ICONS, name) ? ICONS[name] : Package
}

const useRegistryStore = create<{
  version: number
  ids: string[]
  /** Listed apps left out because a built-in app has their id. */
  clashes: string[]
}>(() => ({
  version: 0,
  ids: [],
  clashes: [],
}))

/** Subscribe a component to marketplace apps arriving in or leaving `APP_REGISTRY`. */
export function useRegistryVersion(): number {
  return useRegistryStore((s) => s.version)
}

/** True when `appId` is a marketplace app rather than a built-in add-on. */
export function isMarketplaceApp(appId: string): boolean {
  return useRegistryStore.getState().ids.includes(appId)
}

/**
 * The ids of listed apps the registry left out because a built-in app has
 * the same id (brief 162: the built-in wins, and the pane says so).
 */
export function useBuiltInClashes(): string[] {
  return useRegistryStore((s) => s.clashes)
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
    // One window unless the descriptor says otherwise (brief 162): for a
    // game a second would be a second copy of its world. An office app opens
    // one window per document.
    multiInstance: app.multiInstance === true,
    // After the built-ins in APP_REGISTRY, so where both claim a type the
    // built-in stays the default and this one is offered in Open With.
    // Undefined rather than empty, or "Show all" would list every app.
    ...(app.opens?.length ? { opens: [...app.opens] } : {}),
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
  useRegistryStore.setState((s) => ({
    version: s.version + 1,
    ids: added,
    clashes: clashesWith(apps, builtIn),
  }))
}

/** The listed ids a built-in app already has, installed or not. */
function clashesWith(apps: MarketplaceApp[], builtIn: ReadonlySet<string>): string[] {
  return [...new Set(apps.map((a) => a.id).filter((id) => builtIn.has(id)))]
}

/** The ids in `APP_REGISTRY` that are built-in add-ons rather than marketplace apps. */
function builtInIds(): Set<string> {
  const ours = new Set(useRegistryStore.getState().ids)
  return new Set(APP_REGISTRY.map((a) => a.id).filter((id) => !ours.has(id)))
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
  } else {
    // A clash is worth reporting before anything is installed, and noting
    // it must not remount the open windows.
    const clashes = clashesWith(data.apps, builtInIds())
    if (clashes.join() !== useRegistryStore.getState().clashes.join()) {
      useRegistryStore.setState({ clashes })
    }
  }
  return data
}

let lastKey: string | null = null
