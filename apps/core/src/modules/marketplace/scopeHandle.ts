import type { SystemHandle } from '@imbatranim/ui'
import type { Capability } from '../../shared/registry/marketplace'

/**
 * What an installed app's module exports (brief 120). The boundary is the
 * DOM, not the component tree: the app renders itself into `container` with
 * whatever it likes (its own React, raw canvas, WebGPU), so it never shares
 * core's React and runs at full speed in the desktop's own page.
 */
export type NativeAppModule = {
  mount(container: HTMLElement, system: SystemHandle, host: NativeHostContext): void | Promise<void>
  unmount?(container: HTMLElement): void
}

/** Where things are, for the app. The third argument to `mount`. */
export type NativeHostContext = {
  appId: string
  /** The URL of the directory the app's module was served from, ending in `/`. */
  assetBase: string
  /** A service app's server, through the desktop's session-checked proxy. Null for a static app. */
  server: { http: string; ws: string } | null
}

/** Members of the handle that are not capabilities: every app has them. */
const ALWAYS = new Set(['protocolVersion', 'appId', 'windowId', 'window', 'appearance', 'on'])

/**
 * The handle, minus the capabilities the descriptor did not ask for. Asking
 * for one it lacks throws a sentence naming it, rather than failing somewhere
 * inside.
 *
 * A fence for mistakes, not a sandbox: the app's code runs in this page and
 * could reach `fetch` itself. What keeps that acceptable is the catalog: every
 * app here was curated into the OS repo at a pinned commit (brief 120's trust
 * anchor). An app from anywhere else would need the sandboxed runtime.
 */
export function scopeHandle(
  system: SystemHandle,
  granted: readonly Capability[],
  appName: string
): SystemHandle {
  const allowed = new Set<string>([...ALWAYS, ...granted])
  return new Proxy(system, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !allowed.has(prop) && prop in target) {
        throw new Error(
          `${appName} did not ask for system.${prop}; add "${prop}" to its descriptor's capabilities`
        )
      }
      return Reflect.get(target, prop, receiver) as unknown
    },
  })
}
