import {
  PROTOCOL_VERSION,
  type FileChoice,
  type ShortcutBinding,
  type ShortcutDoc,
  type SystemAppearanceState,
  type SystemEvent,
  type SystemEventMap,
  type SystemHandle,
  type SystemHttp,
  type SystemNotifyInput,
  type SystemSoundState,
  type SystemWindow,
} from '@imbatranim/ui'
import { api } from '../lib/axios'
import {
  fetchFileBytes,
  fetchFileBytesWithVersion,
  uploadFileBytes,
  downloadUrl,
} from '../lib/fileBytes'
import { recordRecentFile, removeRecentFile } from '../lib/recentFiles'
import { createSystemData } from '../lib/appData'
import { claimScheduleOccurrence, type ScheduleDomain } from '../lib/scheduleClaim'
import { notify } from '../shared/store/notificationStore'
import { accentColours, useAppearanceStore } from '../shared/store/appearanceStore'
import { useSoundStore } from '../shared/store/soundStore'
import { useIntentStore } from '../shared/store/intentStore'
import { isTopWindow, useWindowStore } from '../shared/store/windowStore'
import { openApp } from '../shared/intents/openApp'
import { APP_REGISTRY } from '../shared/registry/registry'
import { focusIntoWindowSoon } from '../shared/components/window/focusIntoWindow'
import { isShellSuspended } from '../modules/auth/store/authStore'
import { useShortcutStore } from '../shared/hooks/shortcutRegistry'
import { eventMatchesBinding, parseBinding } from '../shared/hooks/useGlobalHotkeys'
import { isTextEntry } from '@imbatranim/ui'
import {
  allOpenerCandidates,
  associationKey,
  candidatesFor,
  openerName,
  resolveOpener,
  useAssociationStore,
} from '../shared/registry/associations'
import { requestPick } from './filePortal'
import { ACTS_AS_USER, createAppInstance, type AppInstance } from './appInstance'
import { grantFile, type GrantExpect } from './fileGrants'

/**
 * The in-process transport of the protocol.
 *
 * One handle per (app, window) mount, built over the exact stores and libs the
 * old direct imports reached — so behaviour is identical, only the coupling
 * changed. The day a sandboxed transport arrives, this file is what gets a
 * postMessage twin; the protocol in `@imbatranim/ui`'s `system.ts` and every
 * app stay put.
 */

/** Imperative twin of `useGlobalHotkeys`, same matcher, same text-entry rule. */
function bindHotkeys(bindings: ShortcutBinding[]): () => void {
  function onKeyDown(e: KeyboardEvent) {
    // Same rule as useGlobalHotkeys: a covered screen eats no keys.
    if (isShellSuspended()) return
    for (const binding of bindings) {
      const parsed = parseBinding(binding.keys)
      if (!eventMatchesBinding(e, parsed)) continue
      const bare = !parsed.mod && !parsed.ctrl && !parsed.alt
      if (bare && isTextEntry(e.target)) continue
      e.preventDefault()
      binding.handler()
      return
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

/**
 * The null-object window for handles minted outside one (background service,
 * desktop layer, widget). Reads return inert values; writes are dev-visible
 * no-ops rather than throws, because "shared code touched window state from a
 * background mount" should degrade, not crash the service.
 */
function windowlessWindow(appId: string): SystemWindow {
  const warn = (op: string) => {
    if (import.meta.env.DEV) {
      console.warn(`[system] ${appId}: window.${op}() ignored — this mount has no window`)
    }
  }
  return {
    setTitle: () => warn('setTitle'),
    requestClose: () => warn('requestClose'),
    focus: () => warn('focus'),
    hide: () => warn('hide'),
    show: () => warn('show'),
    isFocused: () => false,
    isVisible: () => false,
    onCloseRequest: () => {
      warn('onCloseRequest')
      return () => undefined
    },
  }
}

function windowFor(windowId: string): SystemWindow {
  const store = () => useWindowStore.getState()
  return {
    setTitle: (title) => store().updateTitle(windowId, title),
    requestClose: () => store().closeWindow(windowId),
    // The keyboard comes with the raise, as from the taskbar.
    focus: () => {
      store().focusWindow(windowId)
      focusIntoWindowSoon(windowId)
    },
    hide: () => store().hideWindow(windowId),
    show: () => store().showWindow(windowId),
    isFocused: () => isTopWindow(windowId),
    isVisible: () => store().windows.find((w) => w.id === windowId)?.isVisible ?? false,
    onCloseRequest: (guard) => {
      store().registerCloseGuard(windowId, guard)
      return () => store().unregisterCloseGuard(windowId)
    },
  }
}

/**
 * The add-on contract's view: its `theme` is the mode, its `accent` the
 * current accent's strong hex, the one that reads as text on the surfaces.
 */
function appearanceSnapshot(): SystemAppearanceState {
  const state = useAppearanceStore.getState()
  return { theme: state.mode, accent: accentColours(state).strong }
}

/** The tray's volume and mute, as the add-on contract carries them. */
function soundSnapshot(): SystemSoundState {
  const { volume, muted } = useSoundStore.getState()
  return { volume, muted }
}

/** Each handle's running copy, for the code that mounts it to close. Not on the handle: an app can't end itself. */
const instances = new WeakMap<SystemHandle, AppInstance>()

/**
 * The running copy behind a handle, or undefined for one whose calls are the
 * user's ({@link ACTS_AS_USER}). A windowless mount closes it when it
 * unmounts; a window's copy closes by itself when its window leaves the store.
 */
export function appInstanceOf(system: SystemHandle): AppInstance | undefined {
  return instances.get(system)
}

/** Close a window's copy once its window, seen open, has left the store. */
function closeWithWindow(instance: AppInstance, windowId: string): void {
  const isOpen = () => useWindowStore.getState().windows.some((w) => w.id === windowId)
  let seen = isOpen()
  const unsubscribe = useWindowStore.subscribe(() => {
    if (isOpen()) {
      seen = true
      return
    }
    if (!seen) return
    unsubscribe()
    instance.close()
  })
}

export function createSystemHandle(appId: string, windowId: string | null): SystemHandle {
  const win = windowId === null ? windowlessWindow(appId) : windowFor(windowId)
  // The app's own identity: its calls carry its token. Settings, Files and
  // the Terminal call as the user, through the shared client.
  const instance = ACTS_AS_USER.has(appId) ? null : createAppInstance(appId, windowId)
  if (instance && windowId !== null) closeWithWindow(instance, windowId)
  const http: SystemHttp = instance ? instance.http : (api as unknown as SystemHttp)

  // What the user picks in the OS's dialog is given to this copy before the
  // app hears the answer. A copy acting as the user needs nothing given.
  // A picked file comes with its folder to read for an app that declares it
  // reads the opened file's folder, as an open from Files does.
  // So does the `assets/` folder beside it, to add to, for one that declares
  // it attaches files there.
  const config = APP_REGISTRY.find((a) => a.id === appId)
  const readsFolder = config?.readsOpenedFolder === true
  const attaches = config?.attachesUnderAssets === true
  const given =
    (expect: GrantExpect) =>
    async (choice: FileChoice | null): Promise<FileChoice | null> => {
      if (choice && instance) {
        await grantFile({ appId, instanceId: instance.instanceId }, choice, {
          expect,
          withFolder: expect === 'file' && readsFolder,
          withAssets: expect === 'file' && attaches,
        })
      }
      return choice
    }

  const on = <E extends SystemEvent>(
    event: E,
    cb: (payload: SystemEventMap[E]) => void
  ): (() => void) => {
    switch (event) {
      case 'appearance-changed':
        return useAppearanceStore.subscribe(() => {
          ;(cb as (p: SystemAppearanceState) => void)(appearanceSnapshot())
        })
      case 'sound-changed':
        return useSoundStore.subscribe((next, prev) => {
          if (next.volume === prev.volume && next.muted === prev.muted) return
          ;(cb as (p: SystemSoundState) => void)(soundSnapshot())
        })
      case 'visibility': {
        let last = win.isVisible()
        return useWindowStore.subscribe(() => {
          const next = win.isVisible()
          if (next === last) return
          last = next
          ;(cb as (p: boolean) => void)(next)
        })
      }
      case 'focus':
      case 'blur': {
        let last = win.isFocused()
        return useWindowStore.subscribe(() => {
          const next = win.isFocused()
          if (next === last) return
          last = next
          if (next === (event === 'focus')) (cb as (p: void) => void)(undefined)
        })
      }
      default:
        return () => undefined
    }
  }

  const handle: SystemHandle = {
    protocolVersion: PROTOCOL_VERSION,
    appId,
    windowId,

    fs: {
      read: (root, path) => fetchFileBytes(root, path, http),
      readWithVersion: (root, path) => fetchFileBytesWithVersion(root, path, http),
      upload: (root, path, bytes, name, opts) =>
        uploadFileBytes(root, path, bytes, name, opts, http),
      // A bare URL for `<a href>`, `<img>` and `<audio>`: the browser fetches
      // it with the cookie and no header, so it is the user's.
      downloadUrl: (root, path) => downloadUrl(root, path),
      pickOpen: (opts = {}) =>
        requestPick({
          mode: 'open',
          title: opts.title ?? 'Open file',
          extensions: opts.extensions,
          startIn: opts.startIn,
        }).then(given('file')),
      pickSave: (opts = {}) =>
        requestPick({
          mode: 'save',
          title: opts.title ?? 'Save as',
          extensions: opts.extensions,
          suggestedName: opts.suggestedName,
          startIn: opts.startIn,
        }).then(given('file')),
      pickDirectory: (opts = {}) =>
        requestPick({
          mode: 'directory',
          title: opts.title ?? 'Choose a folder',
          startIn: opts.startIn,
        }).then(given('folder')),
      recordRecent: (root, path) => recordRecentFile(root, path, appId, http),
      removeRecent: (root, path) => removeRecentFile(root, path, http),
      // The app gives its own window one of its recents, with its token: the
      // backend allows only the app's own. A copy acting as the user needs
      // nothing given.
      reopenRecent: (root, path) =>
        instance
          ? grantFile(
              { appId, instanceId: instance.instanceId },
              { root, path },
              {
                client: instance.http,
              }
            )
          : Promise.resolve(),
    },

    // The app's own folders, named by the backend from the token its copy's
    // client carries. A windowless copy has a token of its own too.
    data: createSystemData(http),

    // The escape hatch: the shared axios client, narrowed to the protocol's
    // surface, so its interceptors (the 401 → lock-screen drop) still apply.
    // For an app with an identity, each call goes through its copy, which
    // adds the token and answers with the protocol's response shape only.
    http,

    window: win,

    intents: {
      // A window this raises gets the keyboard from openApp; a new one takes
      // it as it mounts. The open is the app's: a file in it is given with
      // the app's token, so only what the app holds (Settings, Files and the
      // Terminal act as the user).
      openApp: (target, payload) =>
        openApp(target, payload, instance ? { appId, http: instance.http } : undefined),
      consume: <T>() =>
        windowId === null
          ? undefined
          : (useIntentStore.getState().consumeIntent(windowId) as T | undefined),
      onIntent: (cb) => {
        if (windowId === null) return () => undefined
        const store = useIntentStore
        // Pending payload first: the launch intent is set before the app mounts.
        const pending = store.getState().consumeIntent(windowId)
        if (pending !== undefined) cb(pending)
        return store.subscribe((state) => {
          const next = state.intents.get(windowId)
          if (next === undefined) return
          store.getState().consumeIntent(windowId)
          cb(next)
        })
      },
      associations: {
        resolveOpener: (name) => resolveOpener(name),
        candidatesFor: (name) => candidatesFor(name),
        allCandidates: () => allOpenerCandidates(),
        keyFor: (name) => associationKey(name),
        openerName: (id) => openerName(id),
        setDefault: (key, id) => useAssociationStore.getState().setDefault(key, id),
      },
    },

    shortcuts: {
      register: (bindings: ShortcutBinding[]) => {
        useShortcutStore.getState().register(bindings.map(({ handler: _h, ...doc }) => doc))
        const unbind = bindHotkeys(bindings)
        return () => {
          unbind()
          useShortcutStore.getState().unregister(bindings.map((b) => b.id))
        }
      },
      document: (docs: ShortcutDoc[]) => {
        useShortcutStore.getState().register(docs)
        return () => useShortcutStore.getState().unregister(docs.map((d) => d.id))
      },
    },

    appearance: { get: appearanceSnapshot },

    sound: { get: soundSnapshot },

    schedule: {
      claim: (domain: ScheduleDomain, itemId, occurrenceMs) =>
        claimScheduleOccurrence(domain, itemId, occurrenceMs, http),
    },

    // No server here: a built-in app runs none. The kit app's host
    // (KitAppHost) puts its window's own claim on the descriptor's server in
    // this member's place, on the handle the app receives.
    server: {
      request: () =>
        Promise.reject(new Error(`${appId} has no server: it isn't a marketplace app.`)),
    },

    // Stamped with this handle's app: a capability cannot toast in another
    // app's name, which the old free `notify(...)` import happily allowed.
    notify: (input: SystemNotifyInput) => notify({ ...input, appId }),

    on,
  }
  if (instance) instances.set(handle, instance)
  return handle
}
