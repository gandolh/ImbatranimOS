import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { SystemProvider, useSystem, type KitAppProps, type NativeHostContext } from '@imbatranim/ui'
import { kitBuildKey, type MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'
import { addKitStyles } from './kitStyles'
import { loadModule } from './loadModule'
import { RefusalPanel } from './RefusalPanel'
import { kitRefusal, protocolRefusal } from './refusals'
import { scopeHandle, type KitAppModule } from './scopeHandle'
import { installSharedKit } from './sharedKit'
import { useServerLease } from './useServerLease'

/**
 * Anything React can render as a component: a function or class, or the
 * object `memo` / `forwardRef` / `lazy` return.
 */
function isComponent(value: unknown): value is ComponentType<KitAppProps> {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)
  )
}

/**
 * A window holding a marketplace **kit app** (brief 163): a component the
 * desktop renders in its own tree, with its own React and UI kit, so it looks
 * and behaves like a built-in add-on.
 *
 * In order: refuse an app built for another shared kit or a newer protocol
 * (brief 175: the window says so in a {@link RefusalPanel}, and nothing is
 * leased, fetched or added); put the shared modules on the global the app's
 * module reads them from; add the build's stylesheets to the page, once per
 * build; import the module; lease the server if it has one; render `App`
 * inside a `SystemProvider` holding the scoped handle, so `useSystem()` in the
 * app (and in the kit's hooks it calls) is fenced to the capabilities its
 * descriptor asked for.
 *
 * The window's own `AppErrorBoundary`, `SystemProvider` and `Suspense` (from
 * `WindowContainer`) sit outside this: a throw in the app's render is a crash
 * of this window only, and a lazy chunk of its own suspends into the window's
 * Loading. A refusal is not a throw, so it raises no crash toast.
 */
export function KitAppHost({ windowId, app }: { windowId: string; app: MarketplaceApp }) {
  // Checked here, outside the host that does the work: an early return in
  // front of its hooks would change their order between renders.
  const refusal = protocolRefusal(app) ?? kitRefusal(app)
  if (refusal) return <RefusalPanel appName={app.name} reason={refusal} />
  return <KitApp windowId={windowId} app={app} />
}

/** The kit app itself, once {@link KitAppHost} has found it can run here. */
function KitApp({ windowId, app }: { windowId: string; app: MarketplaceApp }) {
  const entryPath = app.installed?.entryPath
  if (!entryPath) throw new Error(`${app.name} has no module to load`)

  const system = useSystem()
  const lease = useServerLease(app)
  const [loaded, setLoaded] = useState<{ App: ComponentType<KitAppProps> } | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)

  if (failure) throw failure
  if (lease.state === 'failed') throw lease.error

  const entry = useMemo(() => apiUrl(entryPath), [entryPath])
  const scoped = useMemo(
    () => scopeHandle(system, app.capabilities, app.name),
    [system, app.capabilities, app.name]
  )
  const server = lease.state === 'ready' ? lease.server : undefined
  const host = useMemo<NativeHostContext | null>(
    () =>
      server === undefined ? null : { appId: app.id, assetBase: new URL('.', entry).href, server },
    [app.id, entry, server]
  )

  useEffect(() => {
    let cancelled = false
    // Before the import: the module reads the global as it evaluates.
    installSharedKit()
    const build = kitBuildKey(app)
    const styles = build
      ? addKitStyles(
          build,
          (app.installed?.stylePaths ?? []).map((p) => apiUrl(p).href)
        )
      : Promise.resolve()
    void Promise.all([loadModule(entry.href), styles])
      .then(([mod]) => {
        if (cancelled) return
        const App = (mod as Partial<KitAppModule> | null)?.App
        if (!isComponent(App)) {
          throw new Error(`${app.name}'s module does not export App, a React component`)
        }
        // Wrapped: a bare function handed to a state setter would be called as an updater.
        setLoaded({ App })
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(err instanceof Error ? err : new Error(String(err)))
      })
    return () => {
      cancelled = true
    }
  }, [app, entry])

  if (!loaded || !host) {
    return (
      <div className="text-on-surface-variant flex h-full items-center justify-center p-3 text-sm">
        {lease.state === 'starting' ? 'Starting its server…' : 'Loading…'}
      </div>
    )
  }

  const { App } = loaded
  return (
    <SystemProvider system={scoped}>
      <App windowId={windowId} host={host} />
    </SystemProvider>
  )
}
