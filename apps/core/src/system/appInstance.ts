import axios, {
  AxiosError,
  CanceledError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import type { SystemHttp, SystemHttpRequestConfig, SystemHttpResponse } from '@imbatranim/ui'
import { api } from '../lib/axios'
import { network, NETWORK_ENV, randomHex } from './network'

/** The header a `system` call carries its app's token in. */
export const APP_TOKEN_HEADER = 'X-Imbatranim-App-Token'

/** The `code` of the backend's 403 when the token itself is refused. */
const APP_TOKEN_REFUSED = 'APP_TOKEN_REFUSED'

/**
 * How long a closing copy's calls still go out with its token. React unmounts
 * a window's app after the window has left the store, so an app saving in its
 * own cleanup calls just after its copy started closing.
 */
export const CLOSE_GRACE_MS = 2000

/**
 * The apps whose calls are the user's, carrying no token: the desktop's own
 * Settings, Files and the Terminal. The owner acting through them sees
 * everything, as the owner of the home folder.
 */
export const ACTS_AS_USER: ReadonlySet<string> = new Set(['settings', 'file-manager', 'terminal'])

/**
 * One running copy of an app, as the OS knows it: the app id acts as a Unix
 * user, the instance id as a pid. Core mints the copy a token, registers it
 * with the backend on its first call, and sends it with every call after;
 * the token stays in this closure and goes out only through the network
 * primitives core captured at boot ({@link network}).
 */
export interface AppInstance {
  readonly appId: string
  /** The window's id for a window; a random id for a service, widget or layer. */
  readonly instanceId: string
  /** The copy's HTTP client: every call to the backend carries its token. */
  readonly http: SystemHttp
  /**
   * The copy is closing. Calls under way, and any started within
   * {@link CLOSE_GRACE_MS}, still go out; then its token is revoked and later
   * calls are refused here.
   */
  close(): void
  /** Take back a close (React's StrictMode unmounts and remounts in dev). */
  open(): void
}

type State = 'live' | 'closing' | 'closed'

function apiBase(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? ''
}

/** True for a URL of the backend's own API: only those calls carry a token. */
function isBackendUrl(url: string): boolean {
  const here = window.location.href
  let target: URL
  try {
    target = new URL(url, here)
  } catch {
    return false
  }
  const base = new URL(`${apiBase()}/`, here)
  return target.origin === base.origin && `${target.pathname}/`.startsWith(base.pathname)
}

const RESPONSE_TYPES = new Set(['arraybuffer', 'blob', 'json', 'text'])

/**
 * The request an app asked for, built from the fields the protocol allows,
 * so a JS app can't slip axios options (an adapter, another `env`) or a
 * token header of its own past the type.
 */
function configFrom(
  method: 'get' | 'delete' | 'post' | 'put' | 'patch',
  url: string,
  data: unknown,
  cfg: SystemHttpRequestConfig | undefined
): AxiosRequestConfig {
  const headers = Object.fromEntries(
    Object.entries(cfg?.headers ?? {}).filter(
      ([name, value]) =>
        typeof value === 'string' && name.toLowerCase() !== APP_TOKEN_HEADER.toLowerCase()
    )
  )
  const responseType =
    cfg?.responseType !== undefined && RESPONSE_TYPES.has(cfg.responseType)
      ? cfg.responseType
      : undefined
  return {
    method,
    url,
    data,
    params: cfg?.params,
    headers,
    responseType,
    signal: cfg?.signal,
    timeout: cfg?.timeout,
  }
}

/** The response as the protocol has it: no request or config, which hold the token. */
function bare<T>(res: AxiosResponse<T>): SystemHttpResponse<T> {
  return { data: res.data, status: res.status, headers: res.headers as Record<string, unknown> }
}

/** The error without its config and request, which hold the token. */
function sanitized(err: unknown): unknown {
  if (axios.isCancel(err)) return new CanceledError((err as Error).message)
  if (!axios.isAxiosError(err)) return err
  const res = err.response
  return new AxiosError(
    err.message,
    err.code,
    undefined,
    undefined,
    res
      ? ({
          data: res.data,
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        } as AxiosResponse)
      : undefined
  )
}

/** The `code` of an error body, whatever form the response type left it in. */
async function bodyCode(data: unknown): Promise<unknown> {
  let value = data
  try {
    if (value instanceof ArrayBuffer) value = new TextDecoder().decode(value)
    else if (typeof Blob !== 'undefined' && value instanceof Blob) value = await value.text()
    if (typeof value === 'string') value = JSON.parse(value)
  } catch {
    return undefined
  }
  return typeof value === 'object' && value !== null
    ? (value as { code?: unknown }).code
    : undefined
}

async function isTokenRefusal(err: unknown): Promise<boolean> {
  if (!axios.isAxiosError(err) || err.response?.status !== 403) return false
  return (await bodyCode(err.response.data)) === APP_TOKEN_REFUSED
}

/**
 * A call through the captured `fetch`, with an init and headers of no
 * prototype: a getter an app put on `Object.prototype` for a member the init
 * doesn't set (say `integrity`) would otherwise run against it, and read the
 * token beside it.
 */
function send(
  method: 'POST' | 'DELETE',
  path: string,
  headers: Record<string, string>,
  body?: string
): Promise<Response> {
  const fetchFn = network.fetch
  if (!fetchFn) return Promise.reject(new Error('This browser has no fetch'))
  const init = {
    __proto__: null,
    method,
    headers,
    body,
    credentials: 'include',
    keepalive: method === 'DELETE',
  }
  return fetchFn(`${apiBase()}${path}`, init as unknown as RequestInit)
}

function revokeToken(token: string): void {
  void send('DELETE', '/system/app-tokens/self', {
    __proto__: null,
    [APP_TOKEN_HEADER]: token,
  } as unknown as Record<string, string>).catch(() => undefined)
}

export function createAppInstance(appId: string, windowId: string | null): AppInstance {
  const instanceId = windowId ?? randomHex(16)
  let token: string | null = null
  let registering: Promise<void> | null = null
  let state: State = 'live'
  let closedAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = 0
  let revokeDue = false

  const usable = () =>
    state === 'live' || (state === 'closing' && Date.now() - closedAt <= CLOSE_GRACE_MS)
  const closedError = () => new Error(`${appId} has closed; its calls no longer go out`)

  /**
   * Mint a token and register it, as the user (the call carries no token).
   * The body is put together with `+` so no serializer an app could patch
   * sees the token; the response carries nothing back.
   */
  async function register(): Promise<void> {
    const fresh = randomHex(32)
    const body =
      '{"token":"' +
      fresh +
      '","appId":' +
      JSON.stringify(appId) +
      ',"instanceId":' +
      JSON.stringify(instanceId) +
      ',"windowId":' +
      JSON.stringify(windowId) +
      '}'
    const res = await send(
      'POST',
      '/system/app-tokens',
      { __proto__: null, 'Content-Type': 'application/json' } as unknown as Record<string, string>,
      body
    )
    if (!res.ok) {
      // As the shared client does: a lost session covers the desktop.
      if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      throw new Error(`${appId} could not get its identity: the desktop answered ${res.status}`)
    }
    if (state === 'closed') {
      revokeToken(fresh)
      throw closedError()
    }
    token = fresh
  }

  function ensureToken(): Promise<void> {
    if (token !== null) return Promise.resolve()
    registering ??= register().finally(() => {
      registering = null
    })
    return registering
  }

  /** A refused token: mint another, unless another call already has. */
  async function renew(stale: string): Promise<void> {
    if (token === stale) token = null
    await ensureToken()
  }

  function withToken(config: AxiosRequestConfig, t: string): AxiosRequestConfig {
    return {
      ...config,
      adapter: 'fetch',
      // The DOM's `Response` takes a slightly wider body than axios's type says.
      env: NETWORK_ENV as AxiosRequestConfig['env'],
      headers: { ...(config.headers as Record<string, string>), [APP_TOKEN_HEADER]: t },
    }
  }

  async function request<T>(config: AxiosRequestConfig): Promise<SystemHttpResponse<T>> {
    if (!usable()) throw closedError()
    pending++
    try {
      // Not the OS's API: no token, and the shared client as before.
      if (!isBackendUrl(api.getUri(config))) return bare(await api.request<T>(config))
      await ensureToken()
      let used = token as string
      try {
        return bare(await api.request<T>(withToken(config, used)))
      } catch (err) {
        // The backend restarted, or the session changed: a new token, once.
        // The guard refused before the route ran, so trying again is safe.
        if (!usable() || !(await isTokenRefusal(err))) throw err
        await renew(used)
        used = token as string
        return bare(await api.request<T>(withToken(config, used)))
      }
    } catch (err) {
      throw sanitized(err)
    } finally {
      pending--
      if (pending === 0 && revokeDue) finish()
    }
  }

  function finish(): void {
    revokeDue = false
    state = 'closed'
    const t = token
    token = null
    if (t !== null) revokeToken(t)
  }

  const http: SystemHttp = {
    get<T>(url: string, cfg?: SystemHttpRequestConfig) {
      return request<T>(configFrom('get', url, undefined, cfg))
    },
    delete<T>(url: string, cfg?: SystemHttpRequestConfig) {
      return request<T>(configFrom('delete', url, cfg?.data, cfg))
    },
    post<T>(url: string, data?: unknown, cfg?: SystemHttpRequestConfig) {
      return request<T>(configFrom('post', url, data, cfg))
    },
    put<T>(url: string, data?: unknown, cfg?: SystemHttpRequestConfig) {
      return request<T>(configFrom('put', url, data, cfg))
    },
    patch<T>(url: string, data?: unknown, cfg?: SystemHttpRequestConfig) {
      return request<T>(configFrom('patch', url, data, cfg))
    },
  }

  return {
    appId,
    instanceId,
    http,
    close() {
      if (state !== 'live') return
      state = 'closing'
      closedAt = Date.now()
      timer = setTimeout(() => {
        timer = null
        if (pending > 0) revokeDue = true
        else finish()
      }, CLOSE_GRACE_MS)
    },
    open() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      revokeDue = false
      state = 'live'
    },
  }
}
