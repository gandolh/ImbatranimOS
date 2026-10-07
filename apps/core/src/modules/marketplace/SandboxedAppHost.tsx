import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { PROTOCOL_VERSION, useSystem, type SystemHandle } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import type { MarketplaceApp } from '../../shared/registry/marketplace'
import {
  createSandboxBridge,
  createSandboxWindowState,
  sandboxCapabilities,
  sandboxInit,
  type SandboxBridge,
} from './sandboxBridge'
import { registerSandboxFrame } from './keyboardGuard'
import { scopeHandle } from './scopeHandle'

function apiUrl(path: string): URL {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
  return new URL(`${base.replace(/\/+$/, '')}/${path}`, window.location.href)
}

/** `marketplace/sandbox/<token>/`, the only answer the mint route gives (contract B). */
const SANDBOX_PATH = /^marketplace\/sandbox\/([A-Za-z0-9_-]+)\/$/

function isReady(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const { imb, v } = data as { imb?: unknown; v?: unknown }
  return imb === 'sandbox-ready' && v === 1
}

function failureOf(err: unknown, appName: string): Error {
  const message = (err as { response?: { data?: { message?: unknown } } }).response?.data?.message
  if (typeof message === 'string') return new Error(`${appName} could not start: ${message}`)
  return err instanceof Error ? err : new Error(String(err))
}

/** Whether this window is the focused one, kept live from the handle's focus and blur events. */
function useWindowFocused(system: SystemHandle): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offFocus = system.on('focus', onChange)
      const offBlur = system.on('blur', onChange)
      return () => {
        offFocus()
        offBlur()
      }
    },
    [system]
  )
  return useSyncExternalStore(subscribe, () => system.window.isFocused())
}

/**
 * A window holding an app installed from a URL (brief 158): the app runs in a
 * sandboxed iframe on an opaque origin and reaches the desktop only through
 * the port {@link createSandboxBridge} answers.
 *
 * The frame's files are served under a per-window capability URL, minted when
 * the window opens and revoked when it closes. A `failed` from the frame, or a
 * failure to mint, is thrown during render so the window's error boundary
 * shows it in this window only, as it does for a native app.
 *
 * The keyboard and raising the window (security review of brief 158, M1).
 * The frame's code is hostile, and it can call `focus()` on its own elements
 * whenever it likes. In a real browser that takes the keyboard from the page
 * even while another window is in front, and everything the owner then types
 * goes to the app. So:
 *
 * - While this window is not the focused one, a transparent shield covers the
 *   frame. A press on it raises the window and is used up doing so, as a
 *   window manager's first click often is; then the keyboard goes into the
 *   frame. Nothing else raises the window.
 * - The frame is registered with the page's keyboard guard
 *   ({@link registerSandboxFrame}), which takes the keyboard back whenever a
 *   frame takes it from the window in front, and stops an app that keeps
 *   doing so. Its reason lands in this window's error panel.
 * - The app's `activate`, `window.focus` and `window.show` count only while
 *   the frame has the keyboard and its window is the focused one.
 */
export function SandboxedAppHost({ windowId, app }: { windowId: string; app: MarketplaceApp }) {
  const system = useSystem()
  const frame = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const focused = useWindowFocused(system)

  if (failure) throw failure

  // The keyboard guard watches the frame for as long as it is on the page.
  // A stop is thrown as this window's failure: the boundary shows it and
  // unmounting tears the frame, the port and the token down.
  useEffect(() => {
    const el = frame.current
    if (!src || !el) return
    return registerSandboxFrame({
      windowId,
      name: app.name,
      frame: el,
      stop: (reason) => setFailure(new Error(reason)),
    })
  }, [src, windowId, app.name])

  /**
   * A press on the shield over a background window: raise it, and use the
   * press up doing so. Once the browser is done with the press (its default
   * would put focus on the page), put the keyboard in the frame, if the window
   * did come to the front.
   */
  const onShieldPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    system.window.focus()
    requestAnimationFrame(() => {
      const el = frame.current
      if (el?.isConnected && system.window.isFocused()) el.focus()
    })
  }

  useEffect(() => {
    let cancelled = false
    let token: string | null = null
    let bridge: SandboxBridge | null = null
    // Rate limits and the close guard's memory, kept here rather than in a
    // bridge: the frame can send ready again at will, and that must not reset them.
    const shared = createSandboxWindowState()
    const granted = sandboxCapabilities(app.capabilities)
    const scoped = scopeHandle(system, granted, app.name)

    const revoke = (t: string) => {
      void api.delete(`/marketplace/sandbox/${encodeURIComponent(t)}`).catch(() => undefined)
    }

    // The owner is using the app: its window is the focused one AND the frame
    // has the keyboard. The frame can take the keyboard by itself, so that
    // half alone proves nothing. (Checked against null too: with no frame yet,
    // `activeElement` may also be null.)
    const engaged = () => {
      const el = frame.current
      return el !== null && document.activeElement === el && system.window.isFocused()
    }

    // The frame's origin is opaque ('null'), so the origin says nothing: the
    // sender is trusted only for being this window's iframe. A reload sends
    // another ready, and gets a fresh channel; the old port is closed.
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow
      if (!target || event.source !== target || !isReady(event.data)) return
      bridge?.dispose()
      const channel = new MessageChannel()
      bridge = createSandboxBridge({
        port: channel.port1,
        system: scoped,
        capabilities: granted,
        isEngaged: engaged,
        // Reached only while engaged, so the window is already in front and
        // this changes nothing. Kept so `activate` keeps meaning one thing.
        onActivate: () => system.window.focus(),
        onMounted: () => setLoading(false),
        // Plain text all the way: the error panel renders `error.message` as a
        // React text node. Never feed it to HTML.
        onFailed: (message) => setFailure(new Error(message)),
        shared,
      })
      const init = sandboxInit(scoped, granted)
      // '*' because an opaque origin cannot be named; the port goes to the
      // window that was just checked to be ours.
      target.postMessage({ imb: 'sandbox-init', v: 1, init }, '*', [channel.port2])
    }
    window.addEventListener('message', onMessage)

    void (async () => {
      try {
        if (PROTOCOL_VERSION < app.minSystemVersion) {
          throw new Error(
            `${app.name} needs system protocol ${app.minSystemVersion}; this desktop speaks ${PROTOCOL_VERSION}`
          )
        }
        const { data } = await api.post<{ path?: unknown }>(
          `/marketplace/apps/${app.id}/sandbox`,
          {}
        )
        const path = typeof data.path === 'string' ? data.path : ''
        const minted = SANDBOX_PATH.exec(path)?.[1]
        if (!minted) throw new Error(`${app.name} could not start: the desktop got no sandbox`)
        if (cancelled) return revoke(minted)
        token = minted
        setSrc(apiUrl(path).href)
      } catch (err) {
        if (!cancelled) setFailure(failureOf(err, app.name))
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('message', onMessage)
      bridge?.dispose()
      bridge = null
      if (token) revoke(token)
    }
  }, [app, system, windowId])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {src && (
        // THE SECURITY BOUNDARY. `allow-scripts` without `allow-same-origin`
        // gives the frame an opaque origin: it cannot read this page, its
        // cookies or its storage, and its requests to the API carry no session.
        // Never add `allow-same-origin` (with scripts it lets the frame remove
        // its own sandbox), `allow-top-navigation`, `allow-popups` or
        // `allow-forms`. The backend's CSP `sandbox` directive repeats this for
        // anyone who opens the frame's URL in a tab.
        <iframe
          ref={frame}
          src={src}
          title={app.name}
          sandbox="allow-scripts allow-pointer-lock"
          referrerPolicy="no-referrer"
          className="block h-full w-full border-0"
        />
      )}
      {src && !focused && (
        // The click shield, over the frame while its window is in the
        // background, so a press reaches the desktop rather than the app.
        <div
          data-sandbox-shield=""
          aria-hidden="true"
          className="absolute inset-0"
          onPointerDown={onShieldPointerDown}
        />
      )}
      {loading && (
        <div className="text-on-surface-variant bg-surface pointer-events-none absolute inset-0 flex items-center justify-center text-sm">
          Loading…
        </div>
      )}
    </div>
  )
}
