import type { FsEntry, SystemHandle } from '@imbatranim/ui'
import { PROTOCOL_VERSION } from '@imbatranim/ui'
import { api } from '../lib/axios'
import { downloadUrl, fetchFileBytes, fileName, uploadFileBytes } from '../lib/fileBytes'
import { useWindowStore, type WindowInstance } from '../shared/store/windowStore'
import { useIntentStore } from '../shared/store/intentStore'
import { openApp } from '../shared/intents/openApp'
import { notify } from '../shared/store/notificationStore'

/** The active window is the top-most visible one (highest zIndex among visible). */
function activeWindowId(windows: WindowInstance[]): string | undefined {
  let top: WindowInstance | undefined
  for (const w of windows) {
    if (!w.isVisible) continue
    if (!top || w.zIndex > top.zIndex) top = w
  }
  return top?.id
}

/**
 * Build the in-process {@link SystemHandle} for one window. This is the direct,
 * same-JS-context implementation of the protocol: every capability is wired to
 * an existing shell internal (`lib/fileBytes`, the axios `api`, the window /
 * intent / notification stores), with all `window.*` calls scoped to
 * `windowId`. A future transport (postMessage) swaps this factory for a proxy
 * with no change to app code.
 *
 * Pure: constructing a handle has no side effects (safe to memoize in render).
 * Subscriptions and the close guard are wired only when the app calls `on(...)`
 * / `window.markDirty(...)`.
 */
export function createSystemHandle(windowId: string): SystemHandle {
  // Live unsaved-changes flag for this window. Read by the close guard (below)
  // so a single registered guard always sees the latest state.
  let dirty = false

  // close-request subscribers. Reserved: the compositor has no soft-close
  // intercept yet, so these are held but never invoked (see SystemEvent docs).
  const closeRequestListeners = new Set<() => void>()

  const fs: SystemHandle['fs'] = {
    fetchFileBytes,
    uploadFileBytes,
    downloadUrl,
    fileName,
    list: (root, path) =>
      api.get<FsEntry[]>('/files', { params: { root, path } }).then((res) => res.data),
  }

  // The authed axios instance satisfies SystemHttp structurally — the documented
  // escape hatch is simply the real client in-process.
  const http: SystemHandle['http'] = api

  const win: SystemHandle['window'] = {
    setTitle: (title) => useWindowStore.getState().updateTitle(windowId, title),
    requestClose: () => useWindowStore.getState().closeWindow(windowId),
    resize: (width, height) => useWindowStore.getState().updateSize(windowId, { width, height }),
    focus: () => useWindowStore.getState().focusWindow(windowId),
    minimize: () => useWindowStore.getState().hideWindow(windowId),
    markDirty: (next) => {
      dirty = next
      const store = useWindowStore.getState()
      if (next) {
        store.registerCloseGuard(windowId, () => {
          if (!dirty) return true
          const w = useWindowStore.getState().windows.find((x) => x.id === windowId)
          const base = (w?.title ?? '').replace(/ •$/, '')
          return window.confirm(
            `"${base || 'This document'}" has unsaved changes. Close without saving?`
          )
        })
      } else {
        store.unregisterCloseGuard(windowId)
      }
    },
  }

  const intents: SystemHandle['intents'] = {
    openApp,
    onOpen: (handler) => {
      // Deliver any launch payload pending at subscribe time...
      const pending = useIntentStore.getState().consumeIntent(windowId)
      if (pending !== undefined) handler(pending)
      // ...then fire again on each later re-delivery for this window.
      return useIntentStore.subscribe((state) => {
        if (state.intents.get(windowId) === undefined) return
        const payload = useIntentStore.getState().consumeIntent(windowId)
        if (payload !== undefined) handler(payload)
      })
    },
  }

  const on: SystemHandle['on'] = (event, cb) => {
    if (event === 'close-request') {
      closeRequestListeners.add(cb)
      return () => {
        closeRequestListeners.delete(cb)
      }
    }

    const isActive = () => activeWindowId(useWindowStore.getState().windows) === windowId
    const isVisible = () =>
      useWindowStore.getState().windows.find((w) => w.id === windowId)?.isVisible ?? false

    if (event === 'focus') {
      let prev = isActive()
      if (prev) cb()
      return useWindowStore.subscribe(() => {
        const now = isActive()
        if (now && !prev) cb()
        prev = now
      })
    }

    if (event === 'blur') {
      let prev = isActive()
      if (!prev) cb()
      return useWindowStore.subscribe(() => {
        const now = isActive()
        if (!now && prev) cb()
        prev = now
      })
    }

    // visibilitychange — edge only (minimize / restore).
    let prevVisible = isVisible()
    return useWindowStore.subscribe(() => {
      const now = isVisible()
      if (now !== prevVisible) {
        prevVisible = now
        cb()
      }
    })
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    windowId,
    fs,
    http,
    window: win,
    intents,
    notify,
    on,
  }
}
