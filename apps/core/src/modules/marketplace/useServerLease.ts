import { useEffect, useState } from 'react'
import type { NativeHostContext } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { descriptorIdOf, type MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'

/** Where an app's server answers, through the desktop's session-checked proxy. */
export type ServerAddress = NonNullable<NativeHostContext['server']>

/** Where a window's lease on its app's server stands. */
export type ServerLease =
  | { state: 'starting' }
  | { state: 'ready'; server: NativeHostContext['server'] }
  | { state: 'failed'; error: Error }

type LeasedApp = Pick<MarketplaceApp, 'id' | 'descriptorId' | 'descriptorName' | 'name' | 'type'>

/**
 * One window's claim on its app's server, taken when something asks for it.
 *
 * The lease and the server are the descriptor's: every window of a suite's
 * apps holds its own lease on the one server, by the descriptor's id, and the
 * backend stops the server when the last lease goes. A held lease is renewed
 * on the interval the backend names.
 *
 * `request()` takes the lease on its first call and resolves the server's
 * address once it answers; a later call while it is held reuses it, and one
 * after a failure tries again. `close()` releases it for good (the window
 * closed), and a request after that rejects. `open()` undoes a `close()`: React's
 * StrictMode unmounts and remounts a component once in development, and the
 * window is still open.
 */
export type ServerClaim = {
  request(): Promise<ServerAddress>
  open(): void
  close(): void
}

/** The backend's sentence when it gave one (a full server table, a start that failed). */
function reason(err: unknown): string | null {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  if (typeof message === 'string' && message) return message
  return err instanceof Error && err.message ? err.message : null
}

export function createServerClaim(app: LeasedApp): ServerClaim {
  const descriptor = descriptorIdOf(app)
  const owner = app.descriptorName || app.name
  let closed = false
  let lease: string | null = null
  let renew: ReturnType<typeof setInterval> | undefined
  let pending: Promise<ServerAddress> | null = null

  const drop = (id: string) => {
    void api.delete(`/marketplace/apps/${descriptor}/lease/${id}`).catch(() => undefined)
  }

  const release = () => {
    if (renew !== undefined) clearInterval(renew)
    renew = undefined
    if (lease) drop(lease)
    lease = null
    pending = null
  }

  async function take(): Promise<ServerAddress> {
    let data: { lease: string; renewMs: number }
    try {
      ;({ data } = await api.post<{ lease: string; renewMs: number }>(
        `/marketplace/apps/${descriptor}/lease`,
        {}
      ))
    } catch (err) {
      pending = null
      const why = reason(err)
      throw new Error(`${owner}'s server didn't start${why ? `: ${why}` : '.'}`, { cause: err })
    }
    if (closed) {
      // The window closed while the server was starting.
      drop(data.lease)
      throw new Error(`${app.name}'s window is closed.`)
    }
    lease = data.lease
    renew = setInterval(() => {
      void api.post(`/marketplace/apps/${descriptor}/lease`, { lease }).catch(() => undefined)
    }, data.renewMs)
    const http = apiUrl(`marketplace/apps/${descriptor}/server`)
    const ws = new URL(http)
    ws.protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'
    return { http: http.href, ws: ws.href }
  }

  return {
    request() {
      if (app.type !== 'service') {
        return Promise.reject(new Error(`${app.name} has no server: its descriptor runs none.`))
      }
      if (closed) return Promise.reject(new Error(`${app.name}'s window is closed.`))
      pending ??= take()
      return pending
    },
    open() {
      closed = false
    },
    close() {
      closed = true
      release()
    },
  }
}

/** A static app has no server, and nothing to wait for. */
const NO_SERVER: ServerLease = { state: 'ready', server: null }

/**
 * Hold a `mount` app's server for as long as its window is open, from the
 * moment it opens: the host mounts the module only once the server is up.
 * A kit app asks for its server itself (`system.server.request()`), through
 * the same claim.
 */
export function useServerLease(app: LeasedApp): ServerLease {
  const service = app.type === 'service'
  const [lease, setLease] = useState<ServerLease>({ state: 'starting' })
  const { id, descriptorId, descriptorName, name, type } = app

  useEffect(() => {
    if (!service) return
    let cancelled = false
    const claim = createServerClaim({ id, descriptorId, descriptorName, name, type })
    claim.request().then(
      (server) => {
        if (!cancelled) setLease({ state: 'ready', server })
      },
      (error: Error) => {
        if (!cancelled) setLease({ state: 'failed', error })
      }
    )
    return () => {
      cancelled = true
      claim.close()
    }
  }, [service, id, descriptorId, descriptorName, name, type])

  return service ? lease : NO_SERVER
}
