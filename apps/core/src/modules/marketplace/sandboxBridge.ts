import type {
  SystemAppearanceState,
  SystemEvent,
  SystemHandle,
  SystemNotifyInput,
  SystemNotifyLevel,
} from '@imbatranim/ui'
import type { Capability } from '../../shared/registry/marketplace'

/**
 * The desktop's side of a sandboxed app's port (brief 158, contract C): the
 * postMessage twin of `createSystemHandle`'s in-process transport.
 *
 * The app on the other end came from a URL nobody reviewed, so everything it
 * sends is treated as hostile input. A message of the wrong shape is dropped;
 * a call the frame may not make is answered with an error, never thrown into
 * the desktop; and a call it may make is checked before it reaches the
 * window's handle. The handle passed in is already narrowed by `scopeHandle`,
 * so a capability the app was not granted is unreachable twice over.
 *
 * DOM-free on purpose: the port is anything shaped like a `MessagePort`, so
 * the tests drive it without a browser.
 */

/** The capabilities a sandboxed app can hold today (brief 158, decision 5). */
export const SANDBOX_CAPABILITIES: readonly Capability[] = ['notify']

/** The granted capabilities this transport actually implements; the rest are dropped. */
export function sandboxCapabilities(granted: readonly Capability[]): Capability[] {
  return granted.filter((c) => SANDBOX_CAPABILITIES.includes(c))
}

/** What the frame gets in `sandbox-init` (contract C). */
export type SandboxInit = {
  appId: string
  windowId: string | null
  protocolVersion: number
  capabilities: Capability[]
  appearance: SystemAppearanceState
  focused: boolean
  visible: boolean
}

/** The `init` payload, read from the window's handle at the moment the frame is ready. */
export function sandboxInit(
  system: SystemHandle,
  capabilities: readonly Capability[]
): SandboxInit {
  const { theme, accent } = system.appearance.get()
  return {
    appId: system.appId,
    windowId: system.windowId,
    protocolVersion: system.protocolVersion,
    capabilities: [...capabilities],
    appearance: { theme, accent },
    focused: system.window.isFocused(),
    visible: system.window.isVisible(),
  }
}

/** The part of a `MessagePort` the bridge uses. */
export interface BridgePort {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  start(): void
  close(): void
}

/**
 * What a window remembers about its app across bridges. The host keeps one per
 * window and hands it to every bridge it builds, because the frame can send
 * `ready` again at will and must not get a fresh allowance, or a fresh
 * standing with the close guard, by doing so.
 */
export type SandboxWindowState = {
  /** When the window's recent notifications were raised. */
  notifiedAt: number[]
  /** When the app's recent title changes were made. */
  titledAt: number[]
  /** When the app last answered a close with `allow: false`; null if it never has. */
  closeRefusedAt: number | null
}

export function createSandboxWindowState(): SandboxWindowState {
  return { notifiedAt: [], titledAt: [], closeRefusedAt: null }
}

export type SandboxBridgeOptions = {
  port: BridgePort
  /** The window's handle, narrowed with `scopeHandle` to the granted capabilities. */
  system: SystemHandle
  capabilities: readonly Capability[]
  /**
   * True while the owner is using the app: the window is the focused one AND
   * its iframe has the keyboard (the host passes
   * `document.activeElement === iframe && system.window.isFocused()`). The
   * frame can take the keyboard by itself (it can call `focus()` inside), so
   * `activeElement` alone is not enough; the desktop's own idea of the focused
   * window is the half the app cannot touch.
   */
  isEngaged: () => boolean
  /** The frame said `activate` while it was engaged: raise the window. */
  onActivate: () => void
  /** The app's `mount` resolved. */
  onMounted: () => void
  /** The app could not start (or gave up): show it in the window's error panel. */
  onFailed: (message: string) => void
  /** Clock for the rate limits and the close escape hatch; tests pass their own. */
  now?: () => number
  /** The window's state, shared by every bridge the host builds for it. */
  shared?: SandboxWindowState
}

export type SandboxBridge = {
  /** Messages dropped for their shape, for a dev warning and the tests. */
  readonly dropped: number
  /** Tell the frame to unmount (best effort), drop every subscription and the guard, close the port. */
  dispose(): void
}

export const NOTIFY_LIMIT = 5
export const NOTIFY_WINDOW_MS = 10_000
export const TITLE_LIMIT = 4
export const TITLE_WINDOW_MS = 1000
export const CLOSE_ASK_TIMEOUT_MS = 60_000
/** A close within this long of the app refusing one goes ahead without asking it. */
export const CLOSE_AGAIN_MS = 10_000
const TITLE_MAX = 200
const BODY_MAX = 2000
const FAILED_MAX = 500
const NOTIFY_LEVELS: readonly SystemNotifyLevel[] = ['info', 'success', 'warning', 'error']
const FORWARDED_EVENTS: readonly SystemEvent[] = [
  'focus',
  'blur',
  'visibility',
  'appearance-changed',
]

type CallId = number | string

type FrameMessage =
  | { t: 'call'; id: CallId; path: string; args: unknown }
  | { t: 'close-guard'; set: boolean }
  | { t: 'close-answer'; id: number; allow: boolean }
  | { t: 'activate' }
  | { t: 'mounted' }
  | { t: 'failed'; message: string }

type ParentMessage =
  | { t: 'return'; id: CallId; ok: true; value: unknown }
  | { t: 'return'; id: CallId; ok: false; error: string }
  | { t: 'event'; name: SystemEvent; payload: unknown }
  | { t: 'close-ask'; id: number }
  | { t: 'unmount' }

/** A plain data object, as structured clone delivers one. Not an array, not a class instance. */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

function isCallId(value: unknown): value is CallId {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0 && value.length <= 100)
  )
}

/** The message's shape, or null when it is not one contract C names. */
function parse(data: unknown): FrameMessage | null {
  if (!isRecord(data)) return null
  switch (data.t) {
    case 'call':
      // `args` is checked by the call it belongs to: with a usable id, a bad
      // argument list is answered rather than left to hang the frame's promise.
      if (!isCallId(data.id) || typeof data.path !== 'string') return null
      return { t: 'call', id: data.id, path: data.path, args: data.args }
    case 'close-guard':
      return typeof data.set === 'boolean' ? { t: 'close-guard', set: data.set } : null
    case 'close-answer':
      return typeof data.id === 'number' && typeof data.allow === 'boolean'
        ? { t: 'close-answer', id: data.id, allow: data.allow }
        : null
    case 'activate':
    case 'mounted':
      return { t: data.t }
    case 'failed':
      // A failure is worth showing even when its message is not a string.
      return {
        t: 'failed',
        message:
          typeof data.message === 'string' && data.message.trim()
            ? data.message.slice(0, FAILED_MAX)
            : 'The app stopped while starting.',
      }
    default:
      return null
  }
}

class CallError extends Error {}

/** `notify`'s input, rebuilt from the fields contract C allows. `actions` never cross. */
function notifyInput(raw: unknown): SystemNotifyInput {
  if (!isRecord(raw)) throw new CallError('notify takes { title, body?, level? }')
  const { title, body, level } = raw
  if (typeof title !== 'string' || title.length < 1 || title.length > TITLE_MAX) {
    throw new CallError(`notify: title must be a string of 1 to ${TITLE_MAX} characters`)
  }
  if (body !== undefined && (typeof body !== 'string' || body.length > BODY_MAX)) {
    throw new CallError(`notify: body must be a string of at most ${BODY_MAX} characters`)
  }
  if (level !== undefined && !NOTIFY_LEVELS.includes(level as SystemNotifyLevel)) {
    throw new CallError(`notify: level must be one of ${NOTIFY_LEVELS.join(', ')}`)
  }
  const input: SystemNotifyInput = { title }
  if (body !== undefined) input.body = body
  if (level !== undefined) input.level = level as SystemNotifyLevel
  return input
}

/**
 * Take a slot in a sliding-window log at time `t`, or refuse the call when the
 * log already holds `limit` entries younger than `windowMs`. Only calls that
 * got this far count: a refused one takes no slot.
 */
function takeSlot(log: number[], t: number, limit: number, windowMs: number, refusal: string) {
  while (log.length > 0 && t - log[0] >= windowMs) log.shift()
  if (log.length >= limit) throw new CallError(refusal)
  log.push(t)
}

export function createSandboxBridge({
  port,
  system,
  capabilities,
  isEngaged,
  onActivate,
  onMounted,
  onFailed,
  now = Date.now,
  shared = createSandboxWindowState(),
}: SandboxBridgeOptions): SandboxBridge {
  let disposed = false
  let dropped = 0
  const subscriptions: (() => void)[] = []
  const asks = new Map<number, { settle: (allow: boolean) => void }>()
  let nextAsk = 1
  let dropGuard: (() => void) | null = null

  const post = (message: ParentMessage) => {
    try {
      port.postMessage(message)
    } catch {
      // A closed port or an uncloneable payload: the frame misses one message.
    }
  }

  const drop = () => {
    dropped++
    if (dropped === 1 && import.meta.env.DEV) {
      console.warn(`[sandbox] ${system.appId}: dropped a message of the wrong shape`)
    }
  }

  /**
   * Ask the frame whether its window may close. Two ways out, so an app cannot
   * hold its window open:
   *
   * - Silence allows: with no answer in 60 s, the window closes.
   * - Press close twice. If the app refused a close less than 10 s ago, this
   *   close goes ahead without asking it. Without this, an app that always
   *   answers `allow: false` would keep its window forever. The owner-facing
   *   docs say "press close twice to force-close"; keep them in step.
   *
   * The refusal is remembered in the window's shared state, so a frame that
   * sends `ready` again (a new bridge) does not wipe it.
   */
  const guard = (): Promise<boolean> => {
    if (disposed) return Promise.resolve(true)
    const refusedAt = shared.closeRefusedAt
    if (refusedAt !== null && now() - refusedAt < CLOSE_AGAIN_MS) return Promise.resolve(true)
    const id = nextAsk++
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => settle(true), CLOSE_ASK_TIMEOUT_MS)
      const settle = (allow: boolean) => {
        clearTimeout(timer)
        asks.delete(id)
        resolve(allow)
      }
      asks.set(id, { settle })
      post({ t: 'close-ask', id })
    })
  }

  const call = (path: string, args: unknown): unknown => {
    const list = args === undefined ? [] : args
    if (!Array.isArray(list)) throw new CallError('args must be an array')
    switch (path) {
      case 'notify': {
        if (!capabilities.includes('notify')) throw new CallError('did not ask for system.notify')
        const input = notifyInput(list[0])
        takeSlot(
          shared.notifiedAt,
          now(),
          NOTIFY_LIMIT,
          NOTIFY_WINDOW_MS,
          `notify: at most ${NOTIFY_LIMIT} every ${NOTIFY_WINDOW_MS / 1000} seconds`
        )
        return system.notify(input)
      }
      case 'window.setTitle': {
        const title: unknown = list[0]
        if (typeof title !== 'string' || title.length > TITLE_MAX) {
          throw new CallError(`setTitle takes a string of at most ${TITLE_MAX} characters`)
        }
        // A title that changes every frame would make the taskbar flicker and
        // re-render the shell for nothing.
        takeSlot(
          shared.titledAt,
          now(),
          TITLE_LIMIT,
          TITLE_WINDOW_MS,
          `setTitle: at most ${TITLE_LIMIT} a second`
        )
        system.window.setTitle(title)
        return null
      }
      case 'window.requestClose':
        system.window.requestClose()
        return null
      case 'window.hide':
        system.window.hide()
        return null
      case 'window.focus':
      case 'window.show': {
        // Raising a window can switch the workspace, and showing one
        // un-minimises it. An app may do either only while the owner is in it;
        // otherwise a background app could pull itself in front of whatever
        // the owner is doing, as often as it liked.
        const name = path.slice('window.'.length)
        if (!isEngaged()) {
          throw new CallError(`${name} is only available while the owner is using the app`)
        }
        if (name === 'focus') system.window.focus()
        else system.window.show()
        return null
      }
      default:
        throw new CallError(`unknown call: ${path.slice(0, 100)}`)
    }
  }

  const handle = (message: FrameMessage) => {
    switch (message.t) {
      case 'call': {
        let value: unknown
        try {
          value = call(message.path, message.args)
        } catch (err) {
          // A CallError is the frame's mistake; anything else is ours, and the
          // frame learns only that the call failed.
          const error = err instanceof CallError ? err.message : `${message.path} failed`
          if (!(err instanceof CallError)) console.error(`[sandbox] ${system.appId}:`, err)
          post({ t: 'return', id: message.id, ok: false, error })
          return
        }
        post({ t: 'return', id: message.id, ok: true, value })
        return
      }
      case 'close-guard':
        if (message.set && !dropGuard) dropGuard = system.window.onCloseRequest(guard)
        else if (!message.set && dropGuard) {
          dropGuard()
          dropGuard = null
        }
        return
      case 'close-answer': {
        const ask = asks.get(message.id)
        if (!ask) return
        if (!message.allow) shared.closeRefusedAt = now()
        ask.settle(message.allow)
        return
      }
      case 'activate':
        // The frame is the app's realm and can send this whenever it likes.
        // Only the page's own focus says the owner is actually in the frame.
        if (isEngaged()) onActivate()
        return
      case 'mounted':
        onMounted()
        return
      case 'failed':
        onFailed(message.message)
        return
    }
  }

  const onMessage = (event: { data: unknown }) => {
    if (disposed) return
    const message = parse(event.data)
    if (!message) return drop()
    try {
      handle(message)
    } catch (err) {
      console.error(`[sandbox] ${system.appId}: handling ${message.t} threw`, err)
    }
  }

  for (const name of FORWARDED_EVENTS) {
    subscriptions.push(
      system.on(name, (payload: unknown) => {
        post({ t: 'event', name, payload })
      })
    )
  }

  port.addEventListener('message', onMessage)
  port.start()

  return {
    get dropped() {
      return dropped
    },
    dispose() {
      if (disposed) return
      disposed = true
      // A close the frame was still deciding goes ahead: the app is leaving anyway.
      for (const ask of [...asks.values()]) ask.settle(true)
      dropGuard?.()
      dropGuard = null
      for (const off of subscriptions.splice(0)) {
        try {
          off()
        } catch {
          // Unsubscribing is best effort.
        }
      }
      post({ t: 'unmount' })
      port.removeEventListener('message', onMessage)
      try {
        port.close()
      } catch {
        // Already closed.
      }
    },
  }
}
