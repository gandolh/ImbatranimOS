import { useEffect, useState } from 'react'
import type { NativeHostContext } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { descriptorIdOf, type MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'

/** Where a window's lease on its app's server stands. */
export type ServerLease =
  | { state: 'starting' }
  | { state: 'ready'; server: NativeHostContext['server'] }
  | { state: 'failed'; error: Error }

/** A static app has no server, and nothing to wait for. */
const NO_SERVER: ServerLease = { state: 'ready', server: null }

/**
 * Hold a service app's server for as long as the calling window is open
 * (brief 120), renewing the lease on the interval the backend names and
 * releasing it on unmount. Both hosts use it: a `mount` app's and a kit app's
 * (brief 163).
 *
 * The lease and the server are the descriptor's (brief 162): every window of
 * a suite's apps holds its own lease on the one server, by the descriptor's
 * id. A static app is `ready` at once with no server.
 */
export function useServerLease(
  app: Pick<MarketplaceApp, 'id' | 'descriptorId' | 'type'>
): ServerLease {
  const service = app.type === 'service'
  const descriptor = descriptorIdOf(app)
  const [lease, setLease] = useState<ServerLease>({ state: 'starting' })

  useEffect(() => {
    if (!service) return
    let cancelled = false
    let id: string | null = null
    let renew: ReturnType<typeof setInterval> | undefined

    const release = () => {
      if (renew !== undefined) clearInterval(renew)
      if (id) void api.delete(`/marketplace/apps/${descriptor}/lease/${id}`).catch(() => undefined)
      id = null
    }

    void (async () => {
      try {
        const { data } = await api.post<{ lease: string; renewMs: number }>(
          `/marketplace/apps/${descriptor}/lease`,
          {}
        )
        id = data.lease
        if (cancelled) return release()
        renew = setInterval(() => {
          void api
            .post(`/marketplace/apps/${descriptor}/lease`, { lease: id })
            .catch(() => undefined)
        }, data.renewMs)
        const http = apiUrl(`marketplace/apps/${descriptor}/server`)
        const ws = new URL(http)
        ws.protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'
        setLease({ state: 'ready', server: { http: http.href, ws: ws.href } })
      } catch (err) {
        if (!cancelled) {
          setLease({ state: 'failed', error: err instanceof Error ? err : new Error(String(err)) })
        }
      }
    })()

    return () => {
      cancelled = true
      release()
    }
  }, [service, descriptor])

  return service ? lease : NO_SERVER
}
