import { useEffect, useRef, useState } from 'react'
import { useSystem } from '@imbatranim/ui'
import type { MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'
import { loadModule } from './loadModule'
import { protocolRefusal } from './refusals'
import { scopeHandle, type NativeAppModule } from './scopeHandle'
import { useServerLease } from './useServerLease'

/**
 * A window holding a marketplace app that mounts itself: fetch its module,
 * hand it the window's content node and a scoped `system`, and take it back on
 * close.
 *
 * A failure while loading or mounting is thrown during render, so the window's
 * error boundary (brief 47) shows it in this window only. A service app's
 * server is held with a lease for as long as the window is open
 * ({@link useServerLease}), and the module is mounted only once it is up.
 */
export function NativeAppHost({ windowId, app }: { windowId: string; app: MarketplaceApp }) {
  // Before anything is leased or fetched.
  const refusal = protocolRefusal(app)
  if (refusal) throw new Error(refusal)

  const system = useSystem()
  const container = useRef<HTMLDivElement>(null)
  const lease = useServerLease(app)
  const [failure, setFailure] = useState<Error | null>(null)
  const [loaded, setLoaded] = useState(false)

  if (failure) throw failure
  if (lease.state === 'failed') throw lease.error

  useEffect(() => {
    const node = container.current
    const installed = app.installed
    if (!node || !installed || lease.state !== 'ready') return
    let cancelled = false
    let mod: NativeAppModule | null = null

    void (async () => {
      try {
        if (!installed.entryPath) throw new Error(`${app.name} has no module to load`)
        const entry = apiUrl(installed.entryPath)
        const loadedModule = (await loadModule(entry.href)) as Partial<NativeAppModule>
        if (cancelled) return
        if (typeof loadedModule.mount !== 'function') {
          throw new Error(`${app.name}'s module does not export mount(container, system)`)
        }
        mod = loadedModule as NativeAppModule
        setLoaded(true)
        await mod.mount(node, scopeHandle(system, app.capabilities, app.name), {
          appId: app.id,
          assetBase: new URL('.', entry).href,
          server: lease.server,
        })
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err : new Error(String(err)))
      }
    })()

    return () => {
      cancelled = true
      try {
        mod?.unmount?.(node)
      } catch (err) {
        console.error(`[marketplace] ${app.id}: unmount threw`, err)
      }
      node.replaceChildren()
    }
  }, [app, system, windowId, lease])

  const status = lease.state === 'starting' ? 'Starting its server…' : loaded ? null : 'Loading…'

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* The app owns this node and everything in it. */}
      <div ref={container} className="h-full w-full" style={{ contain: 'strict' }} />
      {status && (
        <div className="text-on-surface-variant bg-surface pointer-events-none absolute inset-0 flex items-center justify-center text-sm">
          {status}
        </div>
      )}
    </div>
  )
}
