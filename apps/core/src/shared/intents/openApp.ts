import { useWindowStore } from '../store/windowStore'
import { recordRecentFile } from '../../lib/recentFiles'
import { useIntentStore } from '../store/intentStore'
import { APP_REGISTRY } from '../registry/registry'
import { NON_DISABLEABLE } from '../registry/enabledApps'
import { useAddonStore } from '../store/addonStore'
import { isLinuxLauncher, launchLinuxApp } from '../../modules/linux-windows/launchers'
import { focusIntoWindowSoon } from '../components/window/focusIntoWindow'
import { ACTS_AS_USER } from '../../system/appInstance'
import { grantFile } from '../../system/fileGrants'
import type { SystemHttp } from '@imbatranim/ui'

/**
 * The app that asked for an open: through its copy's `system.intents` (with
 * that copy's client), or through a notification action it wrote, which
 * outlives the copy and carries no client.
 */
export type OpenRequester = { appId: string; http?: SystemHttp }

/**
 * Opens an app window with optional payload.
 * If the target is single-instance and already open, focuses the existing window
 * and re-delivers the payload. Otherwise creates a new window.
 *
 * Either way the window ends up with the keyboard. A raised window gets it
 * here, a frame later (whatever menu or palette started this hands focus back
 * to its trigger as it closes); a new one takes it from its own mount, once
 * its content is there (`focusIntoNewWindowSoon`), so it gets it exactly once.
 * Doing it here and not per launcher means no launcher can forget it: the
 * palette, the Notification panel and Start's recent files each did.
 * @param appId - The app ID from APP_REGISTRY
 * @param payload - Optional payload to deliver to the app (app-specific shape)
 * @param by - The app's copy when an app asked for the open; absent, the OS
 *   (a launcher, Files, Start) makes it, as the user
 * @returns The window ID of the opened/focused window, or '' when the app is
 *   disabled or no longer in the registry (the protocol's "refused")
 */
export function openApp(appId: string, payload?: unknown, by?: OpenRequester): string {
  // A disabled add-on can't be launched (file routing / commands can't open a
  // hidden app). Non-disableable core apps always open. Existing open windows
  // are unaffected — they render/close via the full registry elsewhere.
  if (useAddonStore.getState().isDisabled(appId) && !NON_DISABLEABLE.has(appId)) {
    return ''
  }

  const appConfig = APP_REGISTRY.find((app) => app.id === appId)
  if (!appConfig) {
    // A stale id is a normal input, not a bug: notification history and recent
    // files outlive the add-on that raised them. Throwing broke the caller
    // mid-click; the protocol says refused is ''.
    console.warn(`openApp: app "${appId}" is not in the registry`)
    return ''
  }

  // A Linux app's Start entry starts the program; its windows open on their
  // own. Open with hands it the file the payload names.
  if (isLinuxLauncher(appId)) {
    const p = payload as { openPath?: unknown; root?: unknown } | null | undefined
    const file =
      typeof p?.openPath === 'string' && typeof p.root === 'string'
        ? { root: p.root, path: p.openPath }
        : undefined
    void launchLinuxApp(appId, undefined, file)
    return ''
  }

  // The OS records "file X opened with app Y" here, at the one choke point
  // every launcher funnels through. File Manager used to make this
  // call itself, per target app — but attributing a recent to another app is
  // exactly what a scoped capability must forbid, so the shell owns it.
  const files = filesIn(payload)
  const file = files.opened
  // An open an app made is recorded with its own token, which records only
  // the app's own files, so one app opening another records nothing.
  if (file && (!by || (by.http && by.appId === appId))) {
    recordRecentFile(file.root, file.path, appId, by?.http)
  }

  // The OS opening a file with an app gives it that file, for that window
  // only (and each file of a comparison). Made before the payload is
  // delivered, so the app's first read waits on it (see appInstance).
  // Settings, Files and the Terminal act as the user and need nothing given.
  // An open an app made gives with the app's token: the backend hands on
  // only what the app holds, or one of its own recent files to a window of
  // its own, so an app can't open itself with a path to be given it.
  const give = (windowId: string) => {
    // An app's word with no copy to hand on from (a notification action)
    // gives nothing: the app reopens its own recent itself if it is one.
    if (ACTS_AS_USER.has(appId) || (by && !by.http)) return
    for (const given of files.all) {
      void grantFile({ appId, instanceId: windowId }, given, {
        client: by?.http,
        // The folder comes only with an open the OS makes, to an app that
        // declares it reads the opened file's folder; so does the `assets/`
        // folder beside the file, to one that declares it attaches there.
        withFolder: !by && appConfig.readsOpenedFolder === true,
        withAssets: !by && appConfig.attachesUnderAssets === true,
      })
    }
  }

  const windowStore = useWindowStore.getState()
  const intentStore = useIntentStore.getState()

  // Check if single-instance app is already open
  if (!appConfig.multiInstance) {
    const existingWindow = windowStore.windows.find((w) => w.appId === appId)
    if (existingWindow) {
      // Focus first (it switches to the window's workspace), then show: focus
      // alone never un-minimizes, so relaunching a minimized app delivered the
      // intent to a window nobody could see. The command palette's
      // order.
      windowStore.focusWindow(existingWindow.id)
      if (!existingWindow.isVisible) windowStore.showWindow(existingWindow.id)
      give(existingWindow.id)
      if (payload !== undefined) {
        intentStore.setIntent(existingWindow.id, payload)
      }
      focusIntoWindowSoon(existingWindow.id)
      return existingWindow.id
    }
  }

  // Open new window
  const windowId = windowStore.openWindow(
    appId,
    appConfig.name,
    appConfig.defaultSize,
    appConfig.minSize
  )

  give(windowId)
  // Stash payload if provided
  if (payload !== undefined) {
    intentStore.setIntent(windowId, payload)
  }

  return windowId
}

type GivenFile = { root: string; path: string }

/**
 * The files an open names: `{ root, openPath }`, the one file it opens, and a
 * comparison's sides, `{ leftRoot, leftPath }` and `{ rightRoot, rightPath }`
 * (Files' Compare, Git GUI's Compare with HEAD, whose left side is text).
 */
function filesIn(payload: unknown): { opened: GivenFile | null; all: GivenFile[] } {
  if (typeof payload !== 'object' || payload === null) return { opened: null, all: [] }
  const p = payload as Record<string, unknown>
  const pair = (root: string, path: string): GivenFile | null =>
    typeof p[root] === 'string' && typeof p[path] === 'string'
      ? { root: p[root], path: p[path] }
      : null
  const opened = pair('root', 'openPath')
  const all = [opened, pair('leftRoot', 'leftPath'), pair('rightRoot', 'rightPath')].filter(
    (f): f is GivenFile => f !== null
  )
  return { opened, all }
}
