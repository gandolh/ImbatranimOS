import { useEffect, useRef, useState } from 'react'
import { PROTOCOL_VERSION, useSystem } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import type { MarketplaceApp } from '../../shared/registry/marketplace'
import { loadModule } from './loadModule'
import { scopeHandle, type NativeAppModule, type NativeHostContext } from './scopeHandle'

function apiUrl(path: string): URL {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
  return new URL(`${base.replace(/\/+$/, '')}/${path}`, window.location.href)
}

/**
 * A window holding a marketplace app: fetch its module, hand it the window's
 * content node and a scoped `system`, and take it back on close.
 *
 * A failure while loading or mounting is thrown during render, so the window's
 * error boundary (brief 47) shows it in this window only. A service app's
 * server is held with a lease for as long as the window is open.
 */
export function NativeAppHost({ windowId, app }: { windowId: string; app: MarketplaceApp }) {
  const system = useSystem()
  const container = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const [status, setStatus] = useState<string | null>('Loading…')

  if (failure) throw failure

  useEffect(() => {
    const node = container.current
    const installed = app.installed
    if (!node || !installed) return
    let cancelled = false
    let mod: NativeAppModule | null = null
    let lease: string | null = null
    let renew: ReturnType<typeof setInterval> | undefined

    const releaseLease = () => {
      if (renew !== undefined) clearInterval(renew)
      if (lease)
        void api.delete(`/marketplace/apps/${app.id}/lease/${lease}`).catch(() => undefined)
      lease = null
    }

    void (async () => {
      try {
        if (PROTOCOL_VERSION < app.minSystemVersion) {
          throw new Error(
            `${app.name} needs system protocol ${app.minSystemVersion}; this desktop speaks ${PROTOCOL_VERSION}`
          )
        }
        if (!installed.entryPath) throw new Error(`${app.name} has no module to load`)
        const entry = apiUrl(installed.entryPath)
        let server: NativeHostContext['server'] = null
        if (app.type === 'service') {
          setStatus('Starting its server…')
          const { data } = await api.post<{ lease: string; renewMs: number }>(
            `/marketplace/apps/${app.id}/lease`,
            {}
          )
          lease = data.lease
          if (cancelled) return releaseLease()
          renew = setInterval(() => {
            void api.post(`/marketplace/apps/${app.id}/lease`, { lease }).catch(() => undefined)
          }, data.renewMs)
          const http = apiUrl(`marketplace/apps/${app.id}/server`)
          const ws = new URL(http)
          ws.protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'
          server = { http: http.href, ws: ws.href }
        }

        setStatus('Loading…')
        const loaded = (await loadModule(entry.href)) as Partial<NativeAppModule>
        if (cancelled) return releaseLease()
        if (typeof loaded.mount !== 'function') {
          throw new Error(`${app.name}'s module does not export mount(container, system)`)
        }
        mod = loaded as NativeAppModule
        setStatus(null)
        await mod.mount(node, scopeHandle(system, app.capabilities, app.name), {
          appId: app.id,
          assetBase: new URL('.', entry).href,
          server,
        })
      } catch (err) {
        releaseLease()
        if (!cancelled) setFailure(err instanceof Error ? err : new Error(String(err)))
      }
    })()

    return () => {
      cancelled = true
      releaseLease()
      try {
        mod?.unmount?.(node)
      } catch (err) {
        console.error(`[marketplace] ${app.id}: unmount threw`, err)
      }
      node.replaceChildren()
    }
  }, [app, system, windowId])

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
