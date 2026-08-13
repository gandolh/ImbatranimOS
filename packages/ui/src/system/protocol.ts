/**
 * The `SystemHandle` protocol — the capability seam between the compositor (the
 * desktop shell, today `@imbatranim/core`) and an app running in a window.
 *
 * ## Why this exists
 *
 * An app imports UI from `@imbatranim/ui` and receives ONE `system` handle at
 * mount. Everything the app is allowed to do to the outside world — touch the
 * filesystem, call the authed backend, drive its own window, raise
 * notifications, open sibling apps, listen for compositor events — crosses this
 * handle. Apps import NO values from the shell; the handle is their whole
 * privileged surface.
 *
 * ## Transport-agnostic by construction
 *
 * The handle is direct in-process calls today (see
 * `@imbatranim/core`'s `createSystemHandle`) but is shaped so the same surface
 * can later be served across a `postMessage` boundary (each app in its own
 * iframe/worker) with NO app rewrites. That constraint is load-bearing and
 * dictates the rules below:
 *
 * - Nothing on the handle is a React component or otherwise
 *   non-serializable-in-principle. Values that cross are data; the only
 *   functions are the method calls themselves — those become the
 *   request/response shim points a transport implementation replaces.
 * - Callbacks passed IN (`on`, `intents.onOpen`) are the event/stream shim
 *   points; a transport serves them by proxying compositor→app messages.
 * - `http` is the documented escape hatch: a structural, axios-compatible
 *   client. It is the one place raw backend access leaks through, kept minimal
 *   and explicit so it is easy to find and later gate.
 *
 * ## Versioning
 *
 * {@link PROTOCOL_VERSION} is stamped onto every handle as
 * {@link SystemHandle.protocolVersion}. A transport peer reads it to negotiate
 * compatibility; bump it on any breaking change to the surface below.
 */

/** The protocol revision every {@link SystemHandle} advertises. Bump on any breaking change. */
export const PROTOCOL_VERSION = 1

// ── Filesystem ────────────────────────────────────────────────────────────────

/** A filesystem entry kind, as reported by {@link SystemFs.list}. */
export type FsEntryType = 'file' | 'directory'

/** A single directory entry as returned by {@link SystemFs.list} (`GET /api/files`). */
export type FsEntry = {
  /** The entry's own name (last path segment). */
  name: string
  /** Path of the entry relative to its root. */
  path: string
  type: FsEntryType
  /** Size in bytes (0 for directories). */
  size: number
  /** Last-modified time, ISO-8601. */
  modifiedAt: string
}

/**
 * The filesystem capability. Method names + signatures mirror the shell's
 * historical `lib/fileBytes` exports one-for-one so migration off direct
 * imports is mechanical, plus {@link list} for the directory read the file
 * picker needs.
 */
export interface SystemFs {
  /**
   * Fetch a file's raw bytes through the authed backend (session cookie
   * attached) — NOT a bare `fetch`/`<a href>`. A 401 trips the shell's shared
   * interceptor and drops the desktop to the lock screen.
   */
  fetchFileBytes(root: string, path: string): Promise<ArrayBuffer>
  /**
   * Serialize + save bytes back to `path` (overwrite in place; parent dirs
   * auto-created). Surfaces an over-cap upload as {@link UploadTooLargeError}.
   */
  uploadFileBytes(
    root: string,
    path: string,
    bytes: ArrayBuffer | Uint8Array,
    name: string
  ): Promise<void>
  /**
   * Build the bare direct-download URL for a file (for `<a href>`-style
   * downloads). NOT an authed request — reach for {@link fetchFileBytes} when
   * the bytes must cross the authenticated client.
   */
  downloadUrl(root: string, path: string): string
  /** Last path segment (the file's own name), or `fallback` when the path is empty. */
  fileName(path: string, fallback?: string): string
  /** List a directory within a root (`GET /api/files?root=&path=`). */
  list(root: string, path: string): Promise<FsEntry[]>
}

/**
 * Raised by {@link SystemFs.uploadFileBytes} when the backend refuses an
 * over-cap upload (HTTP 413). Lives in the protocol package so there is exactly
 * ONE class definition: `instanceof` holds across the seam no matter which side
 * threw it (the shell's `lib/fileBytes` re-exports this same class for compat).
 */
export class UploadTooLargeError extends Error {
  constructor(message = 'File exceeds the maximum upload size.') {
    super(message)
    this.name = 'UploadTooLargeError'
  }
}

// ── HTTP escape hatch ─────────────────────────────────────────────────────────

/**
 * Request options for {@link SystemHttp}. A deliberately loose, axios-shaped
 * config: the index signature keeps the shell's concrete axios instance
 * structurally assignable without importing axios types into the pure UI
 * package.
 */
export interface HttpRequestConfig {
  params?: unknown
  headers?: Record<string, string>
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream'
  signal?: AbortSignal
  [key: string]: unknown
}

/** A response envelope; a structural subset of axios's `AxiosResponse`. */
export interface HttpResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: unknown
}

/**
 * The authed backend client — the documented escape hatch for calls that have
 * no first-class capability yet. Structural and axios-compatible by design: the
 * shell's existing axios `api` instance satisfies this interface directly, so
 * `http` is simply that instance in-process. Prefer a typed capability
 * ({@link SystemFs} etc.) over reaching for `http` when one exists.
 */
export interface SystemHttp {
  get<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>
  delete<T = unknown>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>>
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>>
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>>
}

// ── Window ────────────────────────────────────────────────────────────────────

/**
 * Control surface for the app's OWN window — never any other window. Every
 * method targets the window this handle was minted for; there is no windowId
 * parameter because an app can only ever address itself.
 */
export interface SystemWindow {
  /** Set the window's title-bar / taskbar label. */
  setTitle(title: string): void
  /**
   * Ask the compositor to close this window. Honors the window's own
   * unsaved-changes veto (see {@link markDirty}); a dirty window may prompt and
   * abort. This is the app-facing equivalent of the user clicking the close box.
   */
  requestClose(): void
  /** Resize the window to `width` × `height` (clamped to the desktop). */
  resize(width: number, height: number): void
  /** Raise + focus this window (bring to front). */
  focus(): void
  /** Minimize this window (hide it to the taskbar without closing). */
  minimize(): void
  /**
   * Declare whether the window has unsaved changes. While `true`, a close
   * attempt (title-bar box, `Ctrl+W`, or {@link requestClose}) prompts the user
   * to confirm before discarding. Call with `false` once saved.
   */
  markDirty(dirty: boolean): void
}

// ── Intents ───────────────────────────────────────────────────────────────────

/**
 * The "open with" payload an app is launched or re-targeted with. Opaque to the
 * protocol (each app defines its own shape); commonly `{ root, openPath }` for
 * file-backed apps.
 */
export type OpenPayload = unknown

/** Cross-app launching + receiving open-with intents. */
export interface SystemIntents {
  /**
   * Open (or focus, for a single-instance target) another app, optionally
   * delivering a payload. Returns the target window's id (empty string if the
   * target is a disabled add-on).
   */
  openApp(appId: string, payload?: OpenPayload): string
  /**
   * Subscribe to open-with intents delivered to THIS window: fires with any
   * payload pending at subscribe time (the launch payload), then again on each
   * later re-delivery (e.g. a single-instance app re-opened with a new file).
   * Returns an unsubscribe function.
   */
  onOpen(handler: (payload: OpenPayload) => void): () => void
}

// ── Notifications ─────────────────────────────────────────────────────────────

/** Visual severity of a notification — drives icon + accent only. */
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error'

/** The shape passed to {@link SystemHandle.notify}. Structural mirror of the shell's `NotifyInput`. */
export type NotifyInput = {
  title: string
  body?: string
  /** Raising app's id — used for the item icon and click-to-open. Defaults to this window's app. */
  appId?: string
  /** Defaults to `'info'`. */
  level?: NotifyLevel
}

// ── Compositor → app events ───────────────────────────────────────────────────

/**
 * Events the compositor pushes to the app, all scoped to this window.
 *
 * - `focus` — the window became the active (top-most visible) window. Also
 *   fires once synchronously at subscribe time IF the window is currently
 *   active, so a subscriber can seed its state without a separate getter.
 * - `blur` — the window stopped being active. Symmetrically fires once at
 *   subscribe time IF the window is currently NOT active.
 * - `visibilitychange` — the window was minimized or restored (its visibility
 *   toggled). Edge only.
 * - `close-request` — the compositor is asking the app to close via a soft
 *   path. RESERVED: no compositor call site emits it yet (today the close path
 *   runs through the window's synchronous unsaved-changes veto, driven by
 *   {@link SystemWindow.markDirty}); subscriptions are accepted and will begin
 *   firing when a soft-close intercept lands, without a protocol change.
 */
export type SystemEvent = 'focus' | 'blur' | 'visibilitychange' | 'close-request'

// ── The handle ────────────────────────────────────────────────────────────────

/**
 * The capability handle the compositor hands each app at mount. Injected as the
 * `system` prop and provided via `SystemProvider`, so app code reaches it with
 * `useSystem()`.
 */
export interface SystemHandle {
  /** The protocol revision this handle implements ({@link PROTOCOL_VERSION}). */
  readonly protocolVersion: number
  /** The id of the window this handle is scoped to. */
  readonly windowId: string
  /** Filesystem access over the authed backend. */
  readonly fs: SystemFs
  /** The authed backend client — the escape hatch for calls without a typed capability. */
  readonly http: SystemHttp
  /** Control of this app's own window. */
  readonly window: SystemWindow
  /** Cross-app launching + open-with intents. */
  readonly intents: SystemIntents
  /** Raise a notification. Returns the new notification's id. */
  notify(input: NotifyInput): string
  /**
   * Subscribe to a compositor event for this window (see {@link SystemEvent}
   * for per-event emission semantics). Returns an unsubscribe function.
   */
  on(event: SystemEvent, cb: () => void): () => void
}
