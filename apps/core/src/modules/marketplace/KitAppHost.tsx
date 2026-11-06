import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  SystemProvider,
  useSystem,
  type KitAppProps,
  type NativeHostContext,
  type SystemServer,
} from '@imbatranim/ui'
import { kitBuildKey, type MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'
import { addKitStyles } from './kitStyles'
import { RefusalPanel } from './RefusalPanel'
import { importKitModule } from './kitModule'
import { isComponent, kitRefusal, protocolRefusal } from './refusals'
import { scopeHandle, withServer, type KitAppModule } from './scopeHandle'
import { createServerClaim } from './useServerLease'

/**
 * A window holding a marketplace **kit app**: a component the
 * desktop renders in its own tree, with its own React and UI kit, so it looks
 * and behaves like a built-in add-on.
 *
 * In order: refuse an app built for another shared kit or a newer protocol
 * (the window says so in a {@link RefusalPanel}, and nothing is
 * leased, fetched or added); put the shared modules on the global the app's
 * module reads them from; add the build's stylesheets to the page, once per
 * build; import the module; render `App` inside a `SystemProvider` holding the
 * scoped handle, so `useSystem()` in the app (and in the kit's hooks it calls)
 * is fenced to the capabilities its descriptor asked for.
 *
 * The descriptor's server is not started here (2026-11-03). The app asks with
 * `system.server.request()` when it needs it, so a window that never does
 * neither waits for a cold start nor fails with it; the app shows its own
 * progress, and a failed start rejects that call and leaves the window open.
 * The window holds the server from that first call until it closes. Before,
 * the host leased first and threw when the lease failed, so every window of a
 * suite with a server waited on it and fell over with it.
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
  // Made with the window, not in an effect: the app's own effects run before
  // this component's, and it may ask for its server in its first one.
  const [claim] = useState(() => createServerClaim(app))
  useEffect(() => {
    claim.open()
    return () => claim.close()
  }, [claim])
  const [loaded, setLoaded] = useState<{ App: ComponentType<KitAppProps> } | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)

  if (failure) throw failure

  const entry = useMemo(() => apiUrl(entryPath), [entryPath])
  const scoped = useMemo(() => {
    const server: SystemServer = { request: () => claim.request() }
    return scopeHandle(withServer(system, server), app.capabilities, app.name)
  }, [system, claim, app.capabilities, app.name])
  const host = useMemo<NativeHostContext>(
    () => ({ appId: app.id, assetBase: new URL('.', entry).href, server: null }),
    [app.id, entry]
  )

  useEffect(() => {
    let cancelled = false
    const build = kitBuildKey(app)
    const styles = build
      ? addKitStyles(
          build,
          (app.installed?.stylePaths ?? []).map((p) => apiUrl(p).href)
        )
      : Promise.resolve()
    // Usually under way already: the registry started it.
    void Promise.all([importKitModule(entry.href), styles])
      .then(([mod]) => {
        if (cancelled) return
        const App = (mod as Partial<KitAppModule> | null)?.App
        if (!isComponent<KitAppProps>(App)) {
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

  if (!loaded) {
    return (
      <div className="text-on-surface-variant flex h-full items-center justify-center p-3 text-sm">
        Loading…
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
