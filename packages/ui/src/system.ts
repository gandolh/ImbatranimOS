/**
 * The app ↔ OS protocol. THIS FILE IS THE SPEC.
 *
 * An app imports nothing from the OS. At mount, the compositor hands it one
 * `system` object — its connection to the machine, the way a Wayland client
 * holds a display connection or a VS Code extension holds its
 * `ExtensionContext`. Everything an app may do to the world is a method here;
 * everything the world may tell an app arrives through `on(...)`. Because the
 * handle is an object passed in, the same app code runs whether it is backed by
 * direct calls (today) or postMessage to a sandboxed iframe (the day
 * third-party apps arrive). Swap the transport; the app never changes.
 *
 * Rules for editing this file:
 *
 * - **Additions are API decisions.** Every member is a promise to every app,
 *   under every future transport. If a thing can be done app-side with what is
 *   already here, it does not get a method.
 * - **Everything must survive postMessage.** Methods take and return data (or
 *   promises of data). Callbacks are fine — a transport can proxy them — but
 *   no live objects, no stores, no DOM nodes.
 * - **Scope is the security model.** A handle is minted for one app in one
 *   window. `window.*` acts on that window alone; `notify` stamps that app's
 *   id. An app cannot address what its handle does not name.
 * - **A handle is a running copy of its app.** Its calls to the backend
 *   (`fs`, `http`, `schedule`, `data`) carry a token the desktop minted for that copy,
 *   so the OS knows which app, and which copy, is calling. The app never sees
 *   the token. `fs.downloadUrl` is a bare URL and goes out as the user's.
 * - Bump {@link PROTOCOL_VERSION} on any breaking change.
 */

export const PROTOCOL_VERSION = 2

// ── Files ─────────────────────────────────────────────────────────────────────

/** A chosen file: which jailed root it lives in, and the path inside it. */
export type FileChoice = { root: string; path: string }

export type PickOpenOptions = {
  title?: string
  /** Preferred extensions, lowercase without the dot. A hint, not a jail. */
  extensions?: string[]
  /**
   * The folder the dialog opens in, instead of the home root: a Save as that
   * starts beside the open document, say. A `path` that names a file means
   * the folder it is in. A start the app couldn't reach by walking the dialog
   * (an unknown root, a path outside the root's jail, a folder that no longer
   * exists) opens at the home root, without an error; either way the user can
   * walk anywhere they could before. Since kit 1.1.0; an older desktop
   * ignores it and opens at the home root.
   */
  startIn?: FileChoice
}

export type PickSaveOptions = PickOpenOptions & { suggestedName?: string }

/** A file's bytes and its version token. */
export type VersionedBytes = { bytes: ArrayBuffer; version: string | null }

export type UploadOptions = {
  /**
   * The version token from the read this save builds on. Absent = overwrite
   * whatever is there (a fresh Save as, an export). A file that is gone counts
   * as changed.
   */
  expected?: string
}

/**
 * `system.fs` — the file syscalls, plus the OS file portal.
 *
 * `read`/`upload` move bytes over the *authenticated* channel: a 401 anywhere
 * drops the desktop to the lock screen, which is exactly right for an
 * internet-exposable OS. The `pick*` trio is the xdg-desktop-portal analogue:
 * the OS renders its Open/Save dialog and the app receives only the choice —
 * pure data, transport-safe, and the dialog UI can never drift per app.
 */
export interface SystemFs {
  /** Fetch a file's raw bytes. Rejects with an HTTP-shaped error on failure. */
  read(root: string, path: string): Promise<ArrayBuffer>
  /**
   * {@link read}, plus the file's version token. An editor keeps the
   * token and hands it back on save, so a save over a file that changed on disk
   * since asks instead of overwriting. `version` is null when the backend sent
   * none.
   */
  readWithVersion(root: string, path: string): Promise<VersionedBytes>
  /**
   * Write bytes to a path (overwrites; creates parent directories). Throws
   * `UploadTooLargeError` when the backend refuses an over-cap body, and
   * `FileConflictError` when `opts.expected` no longer matches the file on
   * disk (nothing is written then). Resolves the new version token.
   */
  upload(
    root: string,
    path: string,
    bytes: ArrayBuffer | Uint8Array,
    name: string,
    opts?: UploadOptions
  ): Promise<{ version: string | null }>
  /** Bare URL for `<a href>`-style downloads (browser-native, cookie-authed). */
  downloadUrl(root: string, path: string): string
  /** OS Open dialog. Resolves the choice, or null on cancel. */
  pickOpen(opts?: PickOpenOptions): Promise<FileChoice | null>
  /** OS Save-as dialog. Resolves the choice, or null on cancel. */
  pickSave(opts?: PickSaveOptions): Promise<FileChoice | null>
  /** OS folder chooser. `path` is `''` at a root. */
  pickDirectory(opts?: { title?: string }): Promise<FileChoice | null>
  /** Record a file in the OS-wide recents, attributed to this app. */
  recordRecent(root: string, path: string): void
  /** Drop a recents entry this app failed to reopen (self-heal). */
  removeRecent(root: string, path: string): void
  /**
   * Ask the OS to give this window one of this app's own recent files again
   * (or, for Git GUI, one of its recent repositories): what a window that
   * reopens a remembered path needs, such as a restored tab. Resolves once
   * the OS has answered; a path that isn't this app's recent stays refused,
   * and reading it answers 403. A method, not an `http` call, because the
   * copy the grant names is the OS's to know.
   */
  reopenRecent(root: string, path: string): Promise<void>
}

// ── The app's own data ────────────────────────────────────────────────────────

/**
 * What a file in an app's folders is for. Each kind is a folder of its own,
 * laid out the XDG way under `imbatranim/<app-id>/` in the home:
 *
 * - `config`: settings (`~/.config/…`);
 * - `data`: what the app keeps for the owner (`~/.local/share/…`);
 * - `state`: history, recents, where it was left (`~/.local/state/…`);
 * - `cache`: anything it can rebuild (`~/.cache/…`). Backups skip it, and
 *   uninstalling the app always removes it; the other kinds stay unless the
 *   owner asks for them to go.
 */
export type DataKind = 'config' | 'data' | 'state' | 'cache'

export type DataOptions = {
  /** Which of the app's folders. `data` when absent. */
  kind?: DataKind
}

export type DataWriteOptions = DataOptions & {
  /**
   * The version from the read this write builds on, or null when the read
   * found no file (it must still be missing). A file that changed since makes
   * the write throw `FileConflictError`, so two windows can't silently save
   * over each other. Absent writes over whatever is there: for a cache, or a
   * file only this copy of the app ever writes.
   */
  expected?: string | null
}

export type DataRemoveOptions = DataOptions & {
  /**
   * The version from the read this removal builds on (since kit 1.7.0). A
   * file that changed since stays, and the removal throws
   * `FileConflictError`, so a save from another window isn't lost with it.
   */
  expected?: string
}

/** A file read from the app's folder: its text, and its version for the next write. */
export type DataFile = { content: string; version: string }

/** One entry of the app's folder. Links are not listed. */
export type DataEntry = {
  name: string
  /** Its path inside the folder, to hand back to `read`, `list` or `remove`. */
  path: string
  type: 'file' | 'directory'
  size: number
  /** ISO 8601. */
  modifiedAt: string
}

/**
 * `system.data` — the app's own folders, its AppData. The OS makes a folder
 * on the first write into it, named from the app's identity, so an app reaches
 * only its own: a path is relative to the folder, and one that would lead out
 * (`..`, or a link) is refused. What the app makes is its own and private
 * (`rw-------`); who else may read it is the business of its owner and mode.
 *
 * Text only, up to 5 MB a file: settings, saves, lists, recents. Every
 * method rejects with an HTTP-shaped error when the OS refuses, and `write`
 * with `FileConflictError` when `expected` is stale.
 */
export interface SystemData {
  /** A file's text and version, or null when there is no such file. */
  read(path: string, opts?: DataOptions): Promise<DataFile | null>
  /**
   * Write a file, making the folders on the way. Resolves the new version,
   * for the next write.
   */
  write(path: string, content: string, opts?: DataWriteOptions): Promise<{ version: string }>
  /** A folder's entries, `''` for the app's folder itself; none for one not made yet. */
  list(path?: string, opts?: DataOptions): Promise<DataEntry[]>
  /** Remove a file or a folder and what is in it. Nothing there is not an error. */
  remove(path: string, opts?: DataRemoveOptions): Promise<void>
}

// ── HTTP (the escape hatch) ───────────────────────────────────────────────────

export type SystemHttpRequestConfig = {
  params?: Record<string, unknown>
  headers?: Record<string, string>
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'text'
  signal?: AbortSignal
  timeout?: number
  /** Request body for methods whose signature has no data argument (DELETE). */
  data?: unknown
}

export interface SystemHttpResponse<T = unknown> {
  data: T
  status: number
  headers: Record<string, unknown>
}

/**
 * `system.http` — the authenticated backend client, for an app's own routes.
 *
 * Deliberately the loosest capability and the one to prefer *against*: reach
 * for `system.fs` and friends first. It exists because every app is
 * first-party and owns backend modules of its own (notes, calendar, git, …)
 * behind the backend's `SessionGuard`. It is also the future permission boundary: when
 * third-party apps arrive, this is the capability a manifest must ask for.
 */
export interface SystemHttp {
  get<T = unknown>(url: string, config?: SystemHttpRequestConfig): Promise<SystemHttpResponse<T>>
  delete<T = unknown>(url: string, config?: SystemHttpRequestConfig): Promise<SystemHttpResponse<T>>
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: SystemHttpRequestConfig
  ): Promise<SystemHttpResponse<T>>
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: SystemHttpRequestConfig
  ): Promise<SystemHttpResponse<T>>
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: SystemHttpRequestConfig
  ): Promise<SystemHttpResponse<T>>
}

// ── Window ────────────────────────────────────────────────────────────────────

/**
 * `system.window` — the app-facing slice of the compositor, scoped to the
 * app's own window. There is no way to name another window; that is the point.
 *
 * Handles minted without a window (a background service, a desktop layer, a
 * widget) carry a null-object implementation: reads return inert values,
 * writes warn in dev and do nothing. Code shared between windowed and
 * windowless mounts must not depend on window state.
 */
export interface SystemWindow {
  /** Retitle the window (title bar + taskbar). */
  setTitle(title: string): void
  /** Ask to close — runs the close guard first, same as the title-bar X. */
  requestClose(): void
  /** Raise + focus this window. */
  focus(): void
  /** Minimise. */
  hide(): void
  /** Un-minimise (does not steal focus). */
  show(): void
  /** True while this window is the top-most visible one on its workspace. */
  isFocused(): boolean
  /** False while minimised. (Workspace parking is not minimisation: workspaces.) */
  isVisible(): boolean
  /**
   * Register a close veto: settle false to keep the window open (unsaved
   * changes). Returns the unregister function. One guard per window — a second
   * registration replaces the first.
   *
   * The guard may answer synchronously (a plain boolean closes or aborts in
   * the same tick) or with a promise — an async guard is what lets an app ask
   * with its own themed dialog instead of the native confirm (protocol v2).
   * While a promise is pending the close is held open and further close
   * requests for the window are no-ops. Transport note: a callback that
   * returns a promise of a boolean survives postMessage — the transport
   * proxies the call and awaits its settlement, pure data either way.
   */
  onCloseRequest(guard: () => boolean | Promise<boolean>): () => void
}

// ── Intents ───────────────────────────────────────────────────────────────────

/** Why the opener resolved the way it did. */
export type OpenerResolution = {
  appId: string
  reason: 'override' | 'declared' | 'text-fallback' | 'none'
}

export type OpenerCandidate = {
  appId: string
  name: string
  /** An installed Linux app, offered after the OS's own apps; never a default by itself. */
  linux?: boolean
}

/**
 * `system.intents` — the shell: launching apps, and receiving what was thrown
 * at you.
 *
 * Delivery is push-based: `onIntent` fires immediately with a pending payload
 * (the launch intent is set before the app mounts) and again on every
 * re-delivery to an already-open single-instance window. `consume` is the
 * one-shot pull for apps that only ever read a launch payload.
 */
export interface SystemIntents {
  /**
   * Launch (or focus) an app, optionally handing it a payload. Returns its
   * window id, '' if refused. A file the payload names is given to the window
   * as this app hands it on: only a file this app holds, or one of its own
   * recent files to a window of its own; never the file's folder.
   */
  openApp(appId: string, payload?: unknown): string
  /** Drain this window's pending intent, if any. */
  consume<T = unknown>(): T | undefined
  /** Subscribe to intents for this window; pending payload delivered at once. */
  onIntent(cb: (payload: unknown) => void): () => void
  /** The file-association registry, read side + the user's choice. */
  readonly associations: {
    resolveOpener(fileName: string): OpenerResolution
    candidatesFor(fileName: string): OpenerCandidate[]
    allCandidates(): OpenerCandidate[]
    /** The override key for a filename: extension, or whole name when bare. */
    keyFor(fileName: string): string
    /** Display name for an opener app id, or null if unknown. */
    openerName(appId: string): string | null
    /** Persist "always open this type with …" (a dotfile). */
    setDefault(key: string, appId: string): void
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type SystemNotifyLevel = 'info' | 'success' | 'warning' | 'error'

/**
 * Input for `system.notify`. There is deliberately no `appId` field: the
 * handle stamps the app it was minted for, so an app cannot toast in another
 * app's name.
 */
/**
 * A button on a live toast.
 *
 * Intent-shaped DATA, never a closure. Activating one calls
 * `intents.openApp(<the raising app>, payload)` — the same choke point every
 * launcher funnels through — so an action survives postMessage, survives the
 * persisted notification history, and survives the window that raised it being
 * closed. A callback could do none of those things. The target app is stamped
 * from the handle, exactly as `notify` stamps `appId`: an app's toast can only
 * press buttons in that app.
 */
export type SystemNotifyAction = {
  label: string
  /**
   * Delivered verbatim as the `openApp` payload; must be JSON-safe. A file it
   * names is not given: the window reopens it with `fs.reopenRecent` when it
   * is one of the app's recent files.
   */
  payload: unknown
}

export type SystemNotifyInput = {
  title: string
  body?: string
  level?: SystemNotifyLevel
  /**
   * Buttons rendered on the LIVE toast only. History rows keep click-to-open
   * but never render actions: a stale Undo pressed hours later is a footgun.
   */
  actions?: readonly SystemNotifyAction[]
}

// ── Shortcuts ─────────────────────────────────────────────────────────────────

export type ShortcutScope = 'Global' | 'Window management' | 'Editing'

export type ShortcutDoc = {
  /** Stable id, so re-registration (HMR, remount) replaces rather than duplicates. */
  id: string
  /** Binding string, e.g. `mod+k`. */
  keys: string
  description: string
  scope: ShortcutScope
  /** Caveat shown beside the row — e.g. a key the browser may intercept first. */
  note?: string
}

export type ShortcutBinding = ShortcutDoc & { handler: () => void }

/**
 * `system.shortcuts` — the OS shortcut registry. `register` binds AND
 * documents in one call (a bound-but-undiscoverable key and a documented-but-
 * dead row are both impossible); `document` publishes rows for keys the app
 * binds itself inside its own DOM (an editor's mod+B).
 */
export interface SystemShortcuts {
  register(bindings: ShortcutBinding[]): () => void
  document(docs: ShortcutDoc[]): () => void
}

// ── Appearance ────────────────────────────────────────────────────────────────

/**
 * `theme` here is the mode, light or dark, inside whichever desktop theme
 * (Apricot or Classic) is on; `accent` is the current accent's hex.
 */
export type SystemAppearanceState = { theme: 'dark' | 'light'; accent: string }

/**
 * `system.appearance` — read the OS theme. Most apps need nothing here (the
 * design tokens are CSS variables); this exists for the ones that drive a
 * non-DOM surface from it — xterm's palette, Monaco's theme. Live changes
 * arrive via `on('appearance-changed', …)`.
 */
export interface SystemAppearance {
  get(): SystemAppearanceState
}

// ── Sound ─────────────────────────────────────────────────────────────────────

/**
 * The OS volume from the tray: `volume` from 0 to 1, on the same scale as a
 * media element's `volume`, and whether the owner muted everything.
 */
export type SystemSoundState = { volume: number; muted: boolean }

/**
 * `system.sound` — the OS volume, read-only. An app that makes sound plays at
 * its own volume times `volume`, and makes none while `muted`; its own volume
 * control keeps working beside it. An app that makes no sound needs nothing
 * here. Live changes arrive via `on('sound-changed', …)`. There is no setter:
 * the tray is the one place the OS volume changes.
 */
export interface SystemSound {
  get(): SystemSoundState
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export type ScheduleDomain = 'clock' | 'calendar' | 'todo'

/**
 * `system.schedule` — atomic cross-tab occurrence claims, so two
 * desktop tabs polling the same alarm produce exactly one toast. Fails open:
 * an unreachable backend claims true, because a duplicate toast beats a
 * silently missed alarm.
 */
export interface SystemSchedule {
  claim(domain: ScheduleDomain, itemId: string, occurrenceMs: number): Promise<boolean>
}

// ── The app's server ──────────────────────────────────────────────────────────

/** Where an app's server answers, through the desktop's session-checked proxy. */
export type SystemServerAddress = { http: string; ws: string }

/**
 * `system.server` — the app's own server, for a marketplace app whose
 * descriptor runs one (a `service`). The server is the descriptor's: every
 * app of a suite shares it.
 *
 * Nothing is started until an app asks: an app that never needs its server
 * never waits for it and never fails on it, and a window that does need it
 * shows its own progress while it starts.
 */
export interface SystemServer {
  /**
   * Ask for the app's server. Starts it if it isn't running and resolves once
   * it answers, with the URLs to reach it over HTTP and WebSocket. The window
   * holds the server from its first call until it closes, so a second call
   * resolves with the same server at once; the server stops when the last
   * window holding it closes.
   *
   * Rejects with an `Error` whose message the app can show as it is: the
   * server didn't start (with the desktop's reason, such as every server slot
   * being taken), the app's descriptor runs no server, or the window has
   * closed. The window stays open; a later call tries again.
   */
  request(): Promise<SystemServerAddress>
}

// ── Events ────────────────────────────────────────────────────────────────────

/**
 * Compositor → app events. `focus`/`blur` track top-most-visible status;
 * `visibility` fires with the new value on minimise/restore and workspace
 * switches; `appearance-changed` fires with the new theme + accent;
 * `sound-changed` fires with the new OS volume (since kit 1.3.0).
 */
export type SystemEventMap = {
  focus: void
  blur: void
  visibility: boolean
  'appearance-changed': SystemAppearanceState
  'sound-changed': SystemSoundState
}

export type SystemEvent = keyof SystemEventMap

// ── The handle ────────────────────────────────────────────────────────────────

export interface SystemHandle {
  readonly protocolVersion: number
  /** The app this handle was minted for. */
  readonly appId: string
  /** The window it is scoped to, or null outside one (background/layer/widget). */
  readonly windowId: string | null
  readonly fs: SystemFs
  readonly http: SystemHttp
  readonly window: SystemWindow
  readonly intents: SystemIntents
  readonly shortcuts: SystemShortcuts
  readonly appearance: SystemAppearance
  /**
   * The OS volume. Since kit 1.3.0, and optional for that reason: a desktop
   * from before it has none, so an app that may run there plays at its own
   * volume when it is missing. Every app has it, needing no capability.
   */
  readonly sound?: SystemSound
  readonly schedule: SystemSchedule
  /**
   * The app's server, asked for when the app needs it. Since kit 1.2.0, and
   * optional for that reason: a desktop from before it has none, so an app
   * that may run there checks for it. Every app has it, needing no
   * capability; one whose descriptor runs no server gets a rejection.
   */
  readonly server?: SystemServer
  /**
   * The app's own folders. Since kit 1.4.0, and optional for that reason: a
   * desktop from before it has none, so an app that may run there checks for
   * it. Every app has it, needing no capability, a windowless one included.
   */
  readonly data?: SystemData
  /** Raise a notification as this app. Returns the notification id. */
  notify(input: SystemNotifyInput): string
  /** Subscribe to a compositor event. Returns the unsubscribe function. */
  on<E extends SystemEvent>(event: E, cb: (payload: SystemEventMap[E]) => void): () => void
}
