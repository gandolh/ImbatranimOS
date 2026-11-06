import { useMemo, type ComponentType } from 'react'
import {
  SystemProvider,
  useSystem,
  type CommandItem,
  type CommandSource,
  type CommandSourceContext,
  type KitAppModule,
  type KitBackgroundProps,
  type NativeHostContext,
  type SystemHandle,
} from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { notify } from '../../shared/store/notificationStore'
import { useAddonStore } from '../../shared/store/addonStore'
import { getEnabledApps } from '../../shared/registry/enabledApps'
import {
  isCurrentBuild,
  kitHookApps,
  setKitService,
  type MarketplaceApp,
} from '../../shared/registry/marketplace'
import { registerAppSources, unregisterAppSources } from '../../shared/commands/coreSources'
import { createAppInstance, type AppInstance } from '../../system/appInstance'
import { apiUrl } from './apiUrl'
import { importKitModule } from './kitModule'
import { hookRefusal, isComponent, kitRefusal, protocolRefusal } from './refusals'
import { scopeHandle, withServer } from './scopeHandle'

/**
 * A kit app's hooks: the exports its descriptor declares beside `App`, which
 * the desktop runs with no window open.
 *
 * - `Background`, a component mounted by `BackgroundServices` like a built-in
 *   add-on's `background`: a windowless copy of the app with its own identity
 *   (`WindowlessSystemProvider`), its handle fenced to the descriptor's
 *   capabilities.
 * - `commandSources`, searched by the palette and Start's search
 *   (`coreSources.ts`), with an `http` of the app's own.
 *
 * The registry imports this chunk once an installed app declares a hook, when
 * the page is idle, so sign-in never waits on an app's module. Only an app
 * that declares a hook has its module imported before a window opens, and
 * only while it is enabled.
 *
 * What fails costs only that app's hooks, and says so once: a module that
 * does not load, a declared hook it does not export (refused by name), a
 * service that throws (hidden by `BackgroundServices`' boundary), a source
 * that throws or rejects (hidden until the app is turned off and on, or a
 * new build loads).
 */

/** What one app's module brought, for the build it came from. */
type Loaded = {
  entryPath: string
  /** The windowless copy its command sources search as, closed when they go. */
  instance: AppInstance | null
  /** Show its hidden sources again: the app was turned off and on. */
  revive: () => void
}

const loaded = new Map<string, Loaded>()
/** The entry each app's import under way started with. */
const pending = new Map<string, string>()
/** The enabled apps at the last sync, to see one turned back on. */
let enabledBefore = new Set<string>()

/**
 * Bring the hooks in line with the registry: unload those of apps that left
 * or were rebuilt, and load those of enabled apps that declare one and have
 * none loaded yet. Run after every registry sync and every add-on toggle.
 */
export function syncKitHooks(): void {
  const apps = kitHookApps()
  const enabled = new Set(getEnabledApps().map((a) => a.id))
  for (const [id, record] of loaded) {
    if (!isCurrentBuild(id, record.entryPath)) unload(id)
    else if (enabled.has(id) && !enabledBefore.has(id)) record.revive()
  }
  enabledBefore = enabled
  for (const app of apps) {
    const entryPath = app.installed?.entryPath
    if (!entryPath || !enabled.has(app.id)) continue
    if (loaded.has(app.id) || pending.get(app.id) === entryPath) continue
    // Refused here, it is refused in its window too, and the pane says why.
    if (protocolRefusal(app) ?? kitRefusal(app)) continue
    pending.set(app.id, entryPath)
    void load(app, entryPath).finally(() => {
      if (pending.get(app.id) === entryPath) pending.delete(app.id)
    })
  }
}

// An app turned on loads its hooks; one turned off keeps them loaded, out of
// sight: `BackgroundServices` and the sources read the enabled set.
useAddonStore.subscribe((state, previous) => {
  if (state.disabled !== previous.disabled) syncKitHooks()
})

function unload(appId: string): void {
  const record = loaded.get(appId)
  loaded.delete(appId)
  unregisterAppSources(appId)
  record?.instance?.close()
}

async function load(app: MarketplaceApp, entryPath: string): Promise<void> {
  const href = apiUrl(entryPath).href
  let mod: unknown
  try {
    mod = await importKitModule(href)
  } catch (err) {
    if (!isCurrentBuild(app.id, entryPath)) return
    // Until a new build: a module that did not load once will not by asking again.
    loaded.set(app.id, { entryPath, instance: null, revive: () => undefined })
    report(app, `${app.name}'s ${hooksOf(app)} can't run.`, `Its module didn't load: ${text(err)}`)
    return
  }
  if (!isCurrentBuild(app.id, entryPath)) return
  const exports = (typeof mod === 'object' && mod !== null ? mod : {}) as Partial<KitAppModule>
  const record: Loaded = { entryPath, instance: null, revive: () => undefined }
  loaded.set(app.id, record)
  const host: NativeHostContext = {
    appId: app.id,
    assetBase: new URL('.', href).href,
    server: null,
  }

  if (app.background) {
    const Background = exports.Background
    if (isComponent<KitBackgroundProps>(Background)) {
      setKitService(app, kitService(app, Background, host))
    } else {
      report(app, `${app.name}'s background service can't run.`, hookRefusal(app, 'Background'))
    }
  }

  if (app.commandSources) {
    const sources = exports.commandSources
    if (!isSourceList(sources)) {
      report(app, `${app.name}'s commands can't run.`, hookRefusal(app, 'commandSources'))
      return
    }
    const instance = createAppInstance(app.id, null)
    record.instance = instance
    const ctx = sourceContext(app, instance)
    const wrapped = sources.map((source) => kitSource(app, source, ctx))
    record.revive = () => wrapped.forEach((w) => w.revive())
    const refused = registerAppSources(
      app.id,
      wrapped.map((w) => w.source)
    )
    if (refused.length > 0) {
      report(
        app,
        `${app.name}'s commands were left out.`,
        `Another source already lists results under ${refused.map((g) => `"${g}"`).join(', ')}.`
      )
    }
  }
}

/** What a declared module brings, for a sentence. */
function hooksOf(app: MarketplaceApp): string {
  if (app.background && app.commandSources) return 'background service and commands'
  return app.background ? 'background service' : 'commands'
}

/**
 * The component `BackgroundServices` mounts for a kit app, inside the
 * windowless provider it gives every service: the app's `Background`, under
 * that handle fenced to the descriptor's capabilities. A service holds no
 * lease on the app's server; a window does.
 */
function kitService(
  app: MarketplaceApp,
  Background: ComponentType<KitBackgroundProps>,
  host: NativeHostContext
): ComponentType {
  function KitService() {
    const system = useSystem()
    const scoped = useMemo(
      () =>
        scopeHandle(
          withServer(system, {
            request: () =>
              Promise.reject(
                new Error(
                  `${app.name}'s background service can't start its server; only a window can.`
                )
              ),
          }),
          app.capabilities,
          app.name
        ),
      [system]
    )
    return (
      <SystemProvider system={scoped}>
        <Background host={host} />
      </SystemProvider>
    )
  }
  KitService.displayName = `KitService(${app.id})`
  return KitService
}

/**
 * What the app's sources search with: its own windowless copy's `http`, so
 * their calls carry its identity, and only when the descriptor asks for
 * `http`. Read lazily: a source that never touches it is never refused.
 */
function sourceContext(app: MarketplaceApp, instance: AppInstance): CommandSourceContext {
  const fenced = scopeHandle(
    { http: instance.http } as unknown as SystemHandle,
    app.capabilities,
    app.name
  )
  return {
    get http() {
      return fenced.http
    },
  }
}

/**
 * One of a kit app's sources as the palette sees it: searched with the app's
 * context, its results checked and their ids made the app's own, and a throw
 * or a rejection hiding it with one notification. Hidden, it answers nothing
 * until the app is turned off and on again.
 */
function kitSource(
  app: MarketplaceApp,
  source: CommandSource,
  ctx: CommandSourceContext
): { source: CommandSource; revive: () => void } {
  const prefix = `${app.id}:`
  let hidden = false
  const crash = (err: unknown) => {
    if (hidden) return
    hidden = true
    report(app, `${app.name}'s commands stopped working.`, text(err), 'Command source')
  }
  const wrapped: CommandSource = {
    group: source.group,
    search(query) {
      if (hidden) return Promise.resolve([])
      let answer: Promise<unknown>
      try {
        answer = Promise.resolve(source.search(query, ctx))
      } catch (err) {
        crash(err)
        return Promise.resolve([])
      }
      return answer.then(
        (items) => {
          if (hidden) return []
          if (!Array.isArray(items)) {
            crash(new Error(`${source.group}: search answered with something other than a list`))
            return []
          }
          return items.filter(isItem).map((item) => ({
            id: prefix + item.id,
            label: item.label,
            ...(typeof item.subtitle === 'string' ? { subtitle: item.subtitle } : {}),
            group: source.group,
          }))
        },
        (err: unknown) => {
          crash(err)
          return []
        }
      )
    },
    activate(item) {
      if (hidden) return
      const id = item.id.startsWith(prefix) ? item.id.slice(prefix.length) : item.id
      try {
        source.activate({ ...item, id })
      } catch (err) {
        crash(err)
      }
    },
  }
  return {
    source: wrapped,
    revive: () => {
      hidden = false
    },
  }
}

/** A list of sources, each with a group to list under and the two calls. */
function isSourceList(value: unknown): value is CommandSource[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s: unknown) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as CommandSource).group === 'string' &&
        (s as CommandSource).group.trim() !== '' &&
        typeof (s as CommandSource).search === 'function' &&
        typeof (s as CommandSource).activate === 'function'
    )
  )
}

/** A result the palette can show: an id and a label. Anything else is dropped. */
function isItem(value: unknown): value is CommandItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CommandItem).id === 'string' &&
    typeof (value as CommandItem).label === 'string'
  )
}

function text(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err)
}

/**
 * One notification in the app's name, and a line in the system log, as a
 * desktop layer's crash gets. Recording it is fire-and-forget: failing to
 * must not become an error of its own.
 */
function report(app: MarketplaceApp, title: string, body: string, kind = 'Hook'): void {
  notify({ title, body, level: 'error', appId: app.id })
  void api
    .post('/logs/client-error', { appId: app.id, message: `${kind}: ${body}`.slice(0, 300) })
    .catch(() => undefined)
  console.error(`[${app.id}] ${title}`, body)
}
