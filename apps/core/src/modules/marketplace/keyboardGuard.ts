import { topVisibleWindowId, useWindowStore } from '../../shared/store/windowStore'

/**
 * Keeps the owner's keyboard out of sandboxed apps that are not in front
 * (security review of brief 158, M1).
 *
 * A URL app's frame can call `focus()` inside itself at any time, and Chrome
 * then gives it the keyboard even while another window is in front: what the
 * owner types into Notepad goes to the app. The frame is a separate process,
 * so the page learns almost nothing. It gets a `window` `blur`, no `focusin`
 * on the iframe, and a `document.activeElement` that says BODY in the handler
 * and then names the element that had focus before, which is stale. `inert`,
 * `display: none` and the `focus-without-user-activation` policy do not stop
 * it. What does work is the page taking the keyboard back: `el.blur();
 * el.focus()` on the element that should have it. (A plain `el.focus()` on an
 * element the page already thinks is focused does nothing.)
 *
 * So this module listens once for the whole page, not once per app: on every
 * `blur` of the page's window that leaves the focus inside the page (a child
 * frame took it), it puts the keyboard where the owner expects it, and an app
 * that keeps taking it is stopped.
 *
 * Two cases give the page no `blur` at all, so they have their own triggers:
 * - The keyboard is already in a frame in front (a URL app, or the Browser's
 *   page) when another frame takes it. The frames this repo serves (the
 *   sandbox runtime, the Browser's host page) report losing the keyboard with
 *   a `{ imb: 'frame-blur' }` message; when the page itself didn't get it in
 *   the meantime, another frame did, and it goes back to the one in front.
 * - Another window comes to the front by itself (not by a click) while a URL
 *   app's frame holds the keyboard: when W changes away from a URL app, its
 *   frame is blurred and the keyboard goes to the new W.
 *
 * Where the keyboard belongs is decided from the desktop's own state, never
 * from `activeElement` alone:
 * - W, the focused desktop window, is `topVisibleWindowId()` from the window
 *   store (null behind the lock screen, or with no window up).
 * - Every element that gets focus is recorded by a capturing `focusin` on the
 *   document, under the window whose root (`[data-window-id]`, Window.tsx)
 *   contains it, or under "the desktop" when it is in no window (the taskbar,
 *   Start, the palette, the lock screen). The most recent one overall is kept
 *   too. Registered sandbox frames and this module's own sink are never
 *   recorded.
 */

export type SandboxFrameRegistration = {
  /** The desktop window the frame is in. */
  windowId: string
  /** The app's name, for the message it is stopped with. */
  name: string
  frame: HTMLIFrameElement
  /** Tear the app down and show `reason` in its window's error panel. */
  stop: (reason: string) => void
}

export type KeyboardGuardDeps = {
  /** The focused desktop window's id, or null. */
  focusedWindowId: () => string | null
  /** Whether this page (or a frame in it) has the keyboard at all. */
  hasFocus: () => boolean
  /** Whether the pointer is over `el`. */
  isHovered: (el: Element) => boolean
  now: () => number
  /** Call `cb` whenever the windows change; returns the unsubscribe. */
  subscribeWindows: (cb: () => void) => () => void
}

/** Two thefts this close together stop the app. One (a stray focus on mount) is forgiven. */
export const STRIKE_LIMIT = 2
export const STRIKE_WINDOW_MS = 10_000
/** How long after a stop the keyboard is handed back: the frame's removal must land first. */
export const RESTORE_AFTER_STOP_MS = 50

/** The message a frame we serve sends when its keyboard leaves it. */
export const FRAME_BLUR = 'frame-blur'
/**
 * How long a frame's report waits before acting. A click out to the desktop
 * focuses the page before the frame's report can arrive (the frame waits a
 * task, then posts across processes), so one task is enough, and every
 * millisecond more is time the thief has the keyboard.
 */
export const FRAME_BLUR_SETTLE_MS = 0
/** A page focus this close before a frame's report explains it. */
const FOCUS_EXPLAINS_MS = 150

/** Elements that hold a separate document and can take the keyboard like an iframe. */
const FRAMES = 'iframe, frame, embed, object'

function hovered(el: Element): boolean {
  try {
    return el.matches(':hover')
  } catch {
    return false
  }
}

function windowIdOf(el: Element): string | null {
  return el.closest('[data-window-id]')?.getAttribute('data-window-id') ?? null
}

function windowElement(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-window-id]')) {
    if (el.getAttribute('data-window-id') === id) return el
  }
  return null
}

/**
 * Take the keyboard back to `el`. The blur first, because the page may
 * already think `el` has focus while a frame really does, and then a plain
 * `focus()` is a no-op.
 */
function reclaimTo(el: HTMLElement) {
  el.blur()
  el.focus({ preventScroll: true })
}

type Entry = SandboxFrameRegistration & { strikes: number[] }

export function createKeyboardGuard(deps: Partial<KeyboardGuardDeps> = {}) {
  const focusedWindowId = deps.focusedWindowId ?? topVisibleWindowId
  const hasFocus = deps.hasFocus ?? (() => document.hasFocus())
  const isHovered = deps.isHovered ?? hovered
  const now = deps.now ?? Date.now
  const subscribeWindows =
    deps.subscribeWindows ?? ((cb: () => void) => useWindowStore.subscribe(() => cb()))

  const entries = new Map<HTMLIFrameElement, Entry>()
  /** The last element focused in each window, by window id. */
  const lastInWindow = new Map<string, HTMLElement>()
  /** The last element focused outside every window: taskbar, Start, palette, lock screen. */
  let lastOnDesktop: HTMLElement | null = null
  /** The last element focused anywhere. */
  let lastFocused: HTMLElement | null = null
  /**
   * Somewhere to put the keyboard when nothing better is known. Neither the
   * window's root (making every window focusable changes what a click
   * focuses) nor `document.body` (not focusable) does it reliably.
   */
  let sink: HTMLElement | null = null
  let recheck: ReturnType<typeof setTimeout> | undefined
  /** Each page blur is one incident; it strikes at most once, at its first or second look. */
  let incident = 0
  let struck = 0
  let busy = false
  /** When the page itself last got the keyboard (a focusin or its window's focus). */
  let pageFocusedAt = -Infinity
  /** W as last seen, to notice it changing. */
  let lastW: string | null = null
  let unsubscribeWindows: (() => void) | null = null
  const frameChecks = new Set<ReturnType<typeof setTimeout>>()

  const record = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement) || target === sink || target === document.body) return
    if (target instanceof HTMLIFrameElement && entries.has(target)) return
    if (!target.matches(FRAMES)) pageFocusedAt = now()
    lastFocused = target
    const id = windowIdOf(target)
    if (id === null) lastOnDesktop = target
    else lastInWindow.set(id, target)
    for (const [key, el] of lastInWindow) if (!el.isConnected) lastInWindow.delete(key)
  }

  /** Where the keyboard belongs when W is a desktop window (or none). */
  const expected = (w: string | null): HTMLElement | null => {
    // Desktop UI the owner was in last (Start's search, the palette, the lock
    // screen's password) wins over the window behind it, as does W's own.
    if (lastFocused?.isConnected) {
      const id = windowIdOf(lastFocused)
      if (id === null || id === w) return lastFocused
    }
    const el = w === null ? lastOnDesktop : (lastInWindow.get(w) ?? null)
    return el?.isConnected ? el : null
  }

  const stopEntry = (entry: Entry) => {
    unregister(entry)
    try {
      entry.stop(
        `${entry.name} took the keyboard while its window was in the background, so it was stopped.`
      )
    } catch (err) {
      console.error('[keyboard guard] stopping an app threw', err)
    }
  }

  const check = (id: number) => {
    if (entries.size === 0) return
    // Focus left the page altogether (another tab or program): not a theft.
    if (!hasFocus()) return
    const w = focusedWindowId()
    const all = [...entries.values()]
    const own = all.find((e) => e.windowId === w)
    if (own) {
      // The owner is in a URL app: the keyboard goes to its frame, even if
      // another app's frame just took it. When the page already names that
      // frame as focused, a plain focus() is a no-op (the stale-focus quirk),
      // so then it is blurred first; otherwise a plain focus, so the app isn't
      // told it lost focus on every click into it.
      if (document.activeElement === own.frame) reclaimTo(own.frame)
      else own.frame.focus({ preventScroll: true })
      return
    }
    // W is a desktop window, or none: every registered frame is outside it.

    const wEl = w === null ? null : windowElement(w)
    const pointedAt = wEl
      ? [...wEl.querySelectorAll<HTMLElement>(FRAMES)].find((f) => isHovered(f))
      : undefined
    // Where the owner's keyboard belongs; kept for after a stop, below.
    const home = pointedAt ?? expected(w)
    if (pointedAt) {
      // The owner's pointer is on a frame of W's own (the Browser's page):
      // the blur was most likely them clicking into it.
      pointedAt.focus({ preventScroll: true })
    } else {
      reclaimTo(home ?? sinkElement())
    }

    if (struck === id) return
    struck = id
    // Strike only when nothing but a URL app can have done it: every frame on
    // the page is a registered one. That covers W holding a frame of its own
    // (W is not a URL app's window here, so its frame is not registered) and
    // a frame in any other window, such as the Browser's page autofocusing in
    // the background.
    const otherFrames = [...document.querySelectorAll(FRAMES)].some(
      (f) => !(f instanceof HTMLIFrameElement && entries.has(f))
    )
    if (otherFrames) return
    strike(all, home)
  }

  /** One strike each; a second within the window stops the app. */
  const strike = (suspects: Entry[], home: HTMLElement | null | undefined) => {
    const t = now()
    let stopped = false
    for (const entry of suspects) {
      entry.strikes = entry.strikes.filter((at) => t - at < STRIKE_WINDOW_MS)
      entry.strikes.push(t)
      if (entry.strikes.length >= STRIKE_LIMIT) {
        stopEntry(entry)
        stopped = true
      }
    }
    // Removing a frame that held the keyboard drops it on the page's body, so
    // once the stopped frame is gone, hand it back to where the owner was.
    // `home` was taken before the stop: the last unregister clears tracking.
    if (stopped && home) {
      setTimeout(() => {
        if (home.isConnected) reclaimTo(home)
      }, RESTORE_AFTER_STOP_MS)
    }
  }

  /** The desktop iframe whose document sent `source`, if any. */
  const frameOf = (source: MessageEventSource | null): HTMLElement | null => {
    if (!source) return null
    for (const f of document.querySelectorAll<HTMLIFrameElement>('iframe, frame')) {
      if (f.contentWindow === source) return f
    }
    return null
  }

  // The frame the owner was typing in lost the keyboard. If the page didn't
  // get it (the owner clicking out to the desktop), another frame did.
  const frameCheck = (victim: HTMLElement, w: string | null, reportedAt: number) => {
    if (entries.size === 0 || !victim.isConnected) return
    if (!hasFocus()) return // the owner left the page
    if (focusedWindowId() !== w) return // the owner went to another window
    if (pageFocusedAt >= reportedAt - FOCUS_EXPLAINS_MS) return // the owner clicked out
    // Blur first: the page still names the victim as focused, so a plain
    // focus() would be a no-op and the thief would keep the keyboard
    // (measured in Chrome).
    reclaimTo(victim)
    const suspects = [...entries.values()].filter((e) => e.windowId !== w && e.frame !== victim)
    if (suspects.length === 0) return
    // As on a page blur: strike only when every other frame outside W is a
    // registered URL app's, so nothing trusted can have done it.
    const trustedElsewhere = [...document.querySelectorAll(FRAMES)].some(
      (f) =>
        f !== victim && windowIdOf(f) !== w && !(f instanceof HTMLIFrameElement && entries.has(f))
    )
    if (!trustedElsewhere) strike(suspects, victim)
  }

  const onMessage = (event: MessageEvent) => {
    const data: unknown = event.data
    if (!data || typeof data !== 'object' || (data as { imb?: unknown }).imb !== FRAME_BLUR) return
    const frame = frameOf(event.source)
    if (!frame) return
    // Only the frame in front can be the owner's: a report from any other
    // (or forged by an app behind) is ignored.
    const w = focusedWindowId()
    const entry = frame instanceof HTMLIFrameElement ? entries.get(frame) : undefined
    const inFront = entry ? entry.windowId === w : w !== null && windowIdOf(frame) === w
    if (!inFront) return
    const reportedAt = now()
    const timer = setTimeout(() => {
      frameChecks.delete(timer)
      try {
        frameCheck(frame, w, reportedAt)
      } catch (err) {
        console.error('[keyboard guard] frame check threw', err)
      }
    }, FRAME_BLUR_SETTLE_MS)
    frameChecks.add(timer)
  }

  // W changed. A URL app that was in front may still hold the keyboard while
  // the new window, raised by itself rather than by a click, is what the
  // owner now types into: take the keyboard out of the old frame.
  const onWindows = () => {
    const w = focusedWindowId()
    if (w === lastW) return
    const previous = lastW
    lastW = w
    const left = [...entries.values()].find((e) => e.windowId === previous)
    if (!left || entries.get(left.frame)?.windowId === w) return
    try {
      left.frame.blur()
      if (!entries.size || [...entries.values()].some((e) => e.windowId === w)) return
      reclaimTo(expected(w) ?? sinkElement())
    } catch (err) {
      console.error('[keyboard guard] window change threw', err)
    }
  }

  const run = (id: number) => {
    if (busy) return
    busy = true
    try {
      check(id)
    } catch (err) {
      console.error('[keyboard guard] check threw', err)
    } finally {
      busy = false
    }
  }

  const onFocusIn = (event: FocusEvent) => record(event.target)

  const onPageFocus = (event: FocusEvent) => {
    if (!(event.target instanceof Node)) pageFocusedAt = now()
  }

  // At once, so no key lands in the thief first; and again a task later,
  // because the page's idea of its focus settles only after the event.
  const onBlur = (event: FocusEvent) => {
    // Capturing on window also sees every element's blur; only the page's own
    // counts. (Its target is the window: not a Node, unlike any element.)
    if (event.target instanceof Node || busy) return
    const id = ++incident
    run(id)
    clearTimeout(recheck)
    recheck = setTimeout(() => run(id), 0)
  }

  function sinkElement(): HTMLElement {
    if (sink?.isConnected) return sink
    sink = document.createElement('div')
    sink.tabIndex = -1
    sink.setAttribute('data-keyboard-guard', '')
    sink.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;outline:none'
    document.body.appendChild(sink)
    return sink
  }

  const install = () => {
    document.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('blur', onBlur, true)
    window.addEventListener('focus', onPageFocus, true)
    window.addEventListener('message', onMessage, false)
    lastW = focusedWindowId()
    unsubscribeWindows = subscribeWindows(onWindows)
    record(document.activeElement)
  }

  const uninstall = () => {
    document.removeEventListener('focusin', onFocusIn, true)
    window.removeEventListener('blur', onBlur, true)
    window.removeEventListener('focus', onPageFocus, true)
    window.removeEventListener('message', onMessage, false)
    unsubscribeWindows?.()
    unsubscribeWindows = null
    for (const timer of frameChecks) clearTimeout(timer)
    frameChecks.clear()
    clearTimeout(recheck)
    sink?.remove()
    sink = null
    lastInWindow.clear()
    lastOnDesktop = null
    lastFocused = null
  }

  function unregister(entry: Entry) {
    if (entries.get(entry.frame) !== entry) return
    entries.delete(entry.frame)
    if (entries.size === 0) uninstall()
  }

  return {
    /** Watch over a sandboxed app's frame. Returns the call that stops watching. */
    register(registration: SandboxFrameRegistration): () => void {
      const entry: Entry = { ...registration, strikes: [] }
      const previous = entries.get(entry.frame)
      if (previous) unregister(previous)
      if (entries.size === 0) install()
      entries.set(entry.frame, entry)
      return () => unregister(entry)
    },
    /** How many frames are registered; for the tests. */
    get size() {
      return entries.size
    },
  }
}

const guard = createKeyboardGuard()

/**
 * Put a sandboxed app's frame under the page's keyboard guard. The guard
 * listens while at least one frame is registered. Returns the unregister call.
 */
export function registerSandboxFrame(registration: SandboxFrameRegistration): () => void {
  return guard.register(registration)
}
