// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useWindowStore } from '../../shared/store/windowStore'
import {
  createKeyboardGuard,
  registerSandboxFrame,
  STRIKE_WINDOW_MS,
  RESTORE_AFTER_STOP_MS,
  FRAME_BLUR_SETTLE_MS,
  type SandboxFrameRegistration,
} from './keyboardGuard'

/**
 * Security review of brief 158, M1 — the page's keyboard guard. In Chrome a
 * background frame's `focus()` takes the keyboard without the page seeing
 * more than a `window` blur, so jsdom cannot play the theft itself. These
 * tests drive the decision: stubs say whether the page still has focus, which
 * desktop window is in front and what the pointer is over, and a `window`
 * blur is dispatched by hand.
 */

let focusedWindow: string | null
let pageHasFocus: boolean
let pointer: Set<Element>
let clock: number
let windowsChanged: (() => void) | null
const unregisters: (() => void)[] = []

function makeGuard() {
  return createKeyboardGuard({
    focusedWindowId: () => focusedWindow,
    hasFocus: () => pageHasFocus,
    isHovered: (el) => pointer.has(el),
    now: () => clock,
    subscribeWindows: (cb) => {
      windowsChanged = cb
      return () => {
        windowsChanged = null
      }
    },
  })
}

function add<K extends keyof HTMLElementTagNameMap>(parent: Element, tag: K) {
  const el = document.createElement(tag)
  parent.appendChild(el)
  return el
}

/** A desktop window's root, as Window.tsx renders it. */
function desktopWindow(id: string) {
  const el = add(document.body, 'div')
  el.setAttribute('data-window-id', id)
  return el
}

/**
 * Notepad (a text area), Calculator, the taskbar's search, and the URL app
 * Hollow. With `orbits`, a second URL app; with `browser`, the Browser, whose
 * page is a frame that is not a URL app's.
 */
function desktop({ orbits = false, browser = false } = {}) {
  const typing = add(desktopWindow('np'), 'textarea')
  const display = add(desktopWindow('calc'), 'input')
  const search = add(add(document.body, 'div'), 'input')
  const hollow = add(desktopWindow('hollow'), 'iframe')
  const orbitsFrame = orbits ? add(desktopWindow('orbits'), 'iframe') : null
  const browserWin = browser ? desktopWindow('br') : null
  const address = browserWin ? add(browserWin, 'input') : null
  const page = browserWin ? add(browserWin, 'iframe') : null
  return { typing, display, search, hollow, orbits: orbitsFrame!, address: address!, page: page! }
}

function register(
  guard: ReturnType<typeof makeGuard>,
  frame: HTMLIFrameElement,
  windowId: string,
  name: string
) {
  const stop: Mock<(reason: string) => void> = vi.fn()
  const off = guard.register({ windowId, name, frame, stop })
  unregisters.push(off)
  return { stop, off }
}

/** The page's window blurs: a frame took the keyboard (or the owner left the page). */
function pageBlur() {
  window.dispatchEvent(new FocusEvent('blur'))
}

/** The second look, a task later. */
const tick = () => new Promise((r) => setTimeout(r, 0))

const stopped = (name: string) =>
  `${name} took the keyboard while its window was in the background, so it was stopped.`

beforeEach(() => {
  focusedWindow = 'np'
  pageHasFocus = true
  pointer = new Set()
  clock = 1_000_000
  windowsChanged = null
})

afterEach(() => {
  for (const off of unregisters.splice(0)) off()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('keyboardGuard: W is a URL app', () => {
  it("gives the keyboard to W's frame, even when another app's frame took it, and strikes nobody", async () => {
    const d = desktop({ orbits: true })
    const guard = makeGuard()
    const hollow = register(guard, d.hollow, 'hollow', 'Hollow')
    const orbits = register(guard, d.orbits, 'orbits', 'Orbits')
    focusedWindow = 'hollow'
    const focus = vi.spyOn(d.hollow, 'focus')
    const blur = vi.spyOn(d.hollow, 'blur')

    pageBlur()
    expect(focus).toHaveBeenCalledTimes(1)
    // A plain focus while the page doesn't name the frame as focused: a blur
    // first would tell the app it lost focus on every click into it.
    expect(blur).not.toHaveBeenCalled()
    await tick()
    // Now the page names it, so a plain focus() would be a no-op (the
    // stale-focus quirk): blur first, then focus.
    expect(document.activeElement).toBe(d.hollow)
    expect(focus).toHaveBeenCalledTimes(2)
    expect(blur).toHaveBeenCalledTimes(1)
    expect(blur.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[1])

    for (let i = 0; i < 5; i++) pageBlur()
    expect(hollow.stop).not.toHaveBeenCalled()
    expect(orbits.stop).not.toHaveBeenCalled()
  })
})

describe('keyboardGuard: W is a desktop window', () => {
  it('takes the keyboard back to the last element in W with a blur then a focus, at once and a task later', async () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    const blur = vi.spyOn(d.typing, 'blur')
    const focus = vi.spyOn(d.typing, 'focus')

    pageBlur()
    // Synchronously, so no key lands in the frame first.
    expect(blur).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(blur.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0])
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    await tick()
    expect(blur).toHaveBeenCalledTimes(2)
    expect(focus).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(d.typing)
  })

  it('remembers what had focus before the first app registered', () => {
    const d = desktop()
    d.typing.focus()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    const focus = vi.spyOn(d.typing, 'focus')
    pageBlur()
    expect(focus).toHaveBeenCalled()
  })

  it("uses W's own last element, not one from the window the owner left", () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    d.display.focus()
    d.typing.focus()
    // The owner then clicked Calculator's title bar: nothing focusable, so no focusin.
    focusedWindow = 'calc'
    const display = vi.spyOn(d.display, 'focus')
    const typing = vi.spyOn(d.typing, 'focus')
    pageBlur()
    expect(display).toHaveBeenCalled()
    expect(typing).not.toHaveBeenCalled()
  })

  it('puts it back in desktop UI the owner was in, such as Start or the lock screen', () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    d.search.focus()
    const search = vi.spyOn(d.search, 'focus')
    pageBlur()
    expect(search).toHaveBeenCalled()

    // Behind the lock screen no window is focused.
    focusedWindow = null
    search.mockClear()
    pageBlur()
    expect(search).toHaveBeenCalled()
  })

  it('falls back to its own focus sink when nothing in W is known', () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'calc'
    pageBlur()
    const sink = document.querySelector('[data-keyboard-guard]')
    expect(sink).not.toBeNull()
    expect(document.activeElement).toBe(sink)
    // The sink is never what it remembers.
    focusedWindow = 'np'
    d.typing.focus()
    focusedWindow = 'calc'
    clock += STRIKE_WINDOW_MS // not a second strike
    pageBlur()
    expect(document.activeElement).toBe(sink)
  })

  it('does nothing while every frame on the page is in W or trusted', () => {
    const d = desktop()
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'hollow'
    const typing = vi.spyOn(d.typing, 'focus')
    pageBlur()
    expect(typing).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })
})

describe('keyboardGuard: strikes', () => {
  it('stops a frame on its second theft within 10 s, and forgives the first', async () => {
    const d = desktop()
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()

    pageBlur()
    await tick() // the second look is the same theft: no second strike
    expect(stop).not.toHaveBeenCalled()

    clock += STRIKE_WINDOW_MS - 1
    pageBlur()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledWith(stopped('Hollow'))
    // Stopped means let go of: nothing more is asked of it.
    expect(guard.size).toBe(0)
    pageBlur()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('hands the keyboard back to where the owner was once the stopped frame is gone', async () => {
    const d = desktop()
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    pageBlur()
    clock += 1000
    pageBlur()
    expect(stop).toHaveBeenCalledTimes(1)
    // The host tears the frame down, which drops the keyboard on the body.
    d.hollow.remove()
    d.typing.blur()
    expect(document.activeElement).toBe(document.body)
    await new Promise((r) => setTimeout(r, RESTORE_AFTER_STOP_MS + 10))
    expect(document.activeElement).toBe(d.typing)
  })

  it('forgets a strike older than 10 s', () => {
    const d = desktop()
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    pageBlur()
    clock += STRIKE_WINDOW_MS
    pageBlur()
    expect(stop).not.toHaveBeenCalled()
    clock += 1
    pageBlur()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('strikes every URL app outside W, since the page cannot tell which one did it', () => {
    const d = desktop({ orbits: true })
    const guard = makeGuard()
    const hollow = register(guard, d.hollow, 'hollow', 'Hollow')
    const orbits = register(guard, d.orbits, 'orbits', 'Orbits')
    d.typing.focus()
    pageBlur()
    clock += 1000
    pageBlur()
    expect(hollow.stop).toHaveBeenCalledWith(stopped('Hollow'))
    expect(orbits.stop).toHaveBeenCalledWith(stopped('Orbits'))
  })

  it('strikes nobody when W holds a frame of its own, but still takes the keyboard back', () => {
    const d = desktop({ browser: true })
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'br'
    d.address.focus()
    const address = vi.spyOn(d.address, 'focus')
    for (let i = 0; i < 4; i++) pageBlur()
    expect(address).toHaveBeenCalledTimes(4)
    expect(stop).not.toHaveBeenCalled()
  })

  it('strikes nobody while a frame that is not a URL app is anywhere on the page', () => {
    // The Browser's page in a background window may have taken it.
    const d = desktop({ browser: true })
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    const typing = vi.spyOn(d.typing, 'focus')
    for (let i = 0; i < 4; i++) pageBlur()
    expect(typing).toHaveBeenCalledTimes(4)
    expect(stop).not.toHaveBeenCalled()
  })

  it('carries on when a stop throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const d = desktop()
    const guard = makeGuard()
    guard.register({
      windowId: 'hollow',
      name: 'Hollow',
      frame: d.hollow,
      stop: () => {
        throw new Error('host bug')
      },
    })
    d.typing.focus()
    pageBlur()
    expect(() => pageBlur()).not.toThrow()
    expect(error).toHaveBeenCalled()
    expect(guard.size).toBe(0)
  })
})

describe('keyboardGuard: the pointer on a frame of W', () => {
  it("gives the keyboard to the Browser's page the owner is pointing at", () => {
    const d = desktop({ browser: true })
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'br'
    d.address.focus()
    pointer.add(d.page)
    const page = vi.spyOn(d.page, 'focus')
    const address = vi.spyOn(d.address, 'focus')
    pageBlur()
    expect(page).toHaveBeenCalledWith({ preventScroll: true })
    expect(address).not.toHaveBeenCalled()
  })

  it('ignores the pointer on a frame outside W', () => {
    const d = desktop({ browser: true })
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    pointer.add(d.page)
    pointer.add(d.hollow)
    const page = vi.spyOn(d.page, 'focus')
    const hollow = vi.spyOn(d.hollow, 'focus')
    const typing = vi.spyOn(d.typing, 'focus')
    pageBlur()
    expect(page).not.toHaveBeenCalled()
    expect(hollow).not.toHaveBeenCalled()
    expect(typing).toHaveBeenCalled()
  })
})

describe('keyboardGuard: when to do nothing', () => {
  it('does nothing when the keyboard left the page (another tab or program)', async () => {
    const d = desktop()
    const guard = makeGuard()
    const { stop } = register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    pageHasFocus = false
    const typing = vi.spyOn(d.typing, 'focus')
    const hollow = vi.spyOn(d.hollow, 'focus')
    pageBlur()
    pageBlur()
    await tick()
    expect(typing).not.toHaveBeenCalled()
    expect(hollow).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  it("reacts to the page's own blur only, not an element's (capture sees those too)", () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    const typing = vi.spyOn(d.typing, 'focus')
    d.display.focus() // the text area blurs
    d.typing.dispatchEvent(new FocusEvent('blur'))
    expect(typing).not.toHaveBeenCalled()
  })
})

describe('keyboardGuard: registering', () => {
  it('listens from the first registration to the last, and cleans up after itself', async () => {
    const adds = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')]
    const removes = [
      vi.spyOn(window, 'removeEventListener'),
      vi.spyOn(document, 'removeEventListener'),
    ]
    const d = desktop({ orbits: true })
    const guard = makeGuard()
    expect(adds.flatMap((a) => a.mock.calls)).toEqual([])

    const hollow = register(guard, d.hollow, 'hollow', 'Hollow')
    const orbits = register(guard, d.orbits, 'orbits', 'Orbits')
    const added = adds.map((a) => a.mock.calls.map(([type, , opts]) => [type, opts]))
    expect(added).toEqual([
      [
        ['blur', true],
        ['focus', true],
        ['message', false],
      ],
      [['focusin', true]],
    ])

    d.typing.focus()
    focusedWindow = 'calc'
    pageBlur() // creates the sink
    expect(document.querySelector('[data-keyboard-guard]')).not.toBeNull()

    hollow.off()
    hollow.off() // a second unregister is a no-op
    expect(guard.size).toBe(1)
    expect(removes.flatMap((r) => r.mock.calls)).toEqual([])

    orbits.off()
    expect(guard.size).toBe(0)
    for (let i = 0; i < 2; i++) {
      for (const [type, fn, opts] of adds[i].mock.calls) {
        expect(removes[i].mock.calls).toContainEqual([type, fn, opts])
      }
    }
    expect(document.querySelector('[data-keyboard-guard]')).toBeNull()

    // Nothing listens any more, and a pending second look does nothing.
    const typing = vi.spyOn(d.typing, 'focus')
    focusedWindow = 'np'
    pageBlur()
    await tick()
    expect(typing).not.toHaveBeenCalled()
    expect(hollow.stop).not.toHaveBeenCalled()
  })

  it('replaces a registration for the same frame', () => {
    const d = desktop()
    const guard = makeGuard()
    const first = register(guard, d.hollow, 'hollow', 'Hollow')
    const second = register(guard, d.hollow, 'hollow', 'Hollow')
    expect(guard.size).toBe(1)
    first.off() // the old one's unregister no longer removes the new one
    expect(guard.size).toBe(1)
    d.typing.focus()
    pageBlur()
    clock += 1
    pageBlur()
    expect(first.stop).not.toHaveBeenCalled()
    expect(second.stop).toHaveBeenCalledTimes(1)
  })

  it('the page-wide guard reads the focused window from the window store', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    useWindowStore.setState({ windows: [], nextZIndex: 1, closeGuards: {} })
    const id = useWindowStore
      .getState()
      .openWindow('notepad', 'notepad', { width: 400, height: 300 }, { width: 200, height: 150 })
    const notepad = desktopWindow(id)
    const typing = add(notepad, 'textarea')
    const hollow = add(desktopWindow('hollow'), 'iframe')
    const registration: SandboxFrameRegistration = {
      windowId: 'hollow',
      name: 'Hollow',
      frame: hollow,
      stop: vi.fn(),
    }
    const off = registerSandboxFrame(registration)
    typing.focus()
    const focus = vi.spyOn(typing, 'focus')
    pageBlur()
    expect(focus).toHaveBeenCalled()
    off()
    focus.mockClear()
    pageBlur()
    expect(focus).not.toHaveBeenCalled()
  })
})

/** A frame we serve reports that its keyboard left it. */
function frameBlur(frame: HTMLIFrameElement) {
  window.dispatchEvent(
    new MessageEvent('message', { data: { imb: 'frame-blur' }, source: frame.contentWindow })
  )
}

const settle = () => new Promise((r) => setTimeout(r, FRAME_BLUR_SETTLE_MS + 5))

describe('keyboardGuard: a frame in front loses the keyboard to another frame', () => {
  it('gives it back to the URL app in front and strikes the apps behind', async () => {
    const d = desktop({ orbits: true })
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    const orbits = register(guard, d.orbits, 'orbits', 'Orbits')
    focusedWindow = 'hollow'
    const focus = vi.spyOn(d.hollow, 'focus')
    const blur = vi.spyOn(d.hollow, 'blur')

    frameBlur(d.hollow)
    await settle()
    // Blur first: the page still names the victim as focused.
    expect(blur).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(blur.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0])
    clock += 1000
    frameBlur(d.hollow)
    await settle()
    expect(orbits.stop).toHaveBeenCalledWith(stopped('Orbits'))
  })

  it("gives it back to the Browser's page in front, without striking while that page could have done it", async () => {
    const d = desktop({ browser: true })
    const guard = makeGuard()
    const hollow = register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'br'
    const focus = vi.spyOn(d.page, 'focus')
    frameBlur(d.page)
    await settle()
    expect(focus).toHaveBeenCalled()
    // The only other frame is Hollow's, so it is struck; twice stops it.
    clock += 1000
    frameBlur(d.page)
    await settle()
    expect(hollow.stop).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the page got the keyboard instead: the owner clicked out', async () => {
    const d = desktop({ orbits: true })
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    const orbits = register(guard, d.orbits, 'orbits', 'Orbits')
    focusedWindow = 'hollow'
    const focus = vi.spyOn(d.hollow, 'focus')
    frameBlur(d.hollow)
    d.typing.focus() // the owner clicked into Notepad
    await settle()
    expect(focus).not.toHaveBeenCalled()
    expect(orbits.stop).not.toHaveBeenCalled()
  })

  it('ignores a report from a frame that is not in front, which an app behind could forge', async () => {
    const d = desktop({ orbits: true })
    const guard = makeGuard()
    const hollow = register(guard, d.hollow, 'hollow', 'Hollow')
    register(guard, d.orbits, 'orbits', 'Orbits')
    focusedWindow = 'hollow'
    const focus = vi.spyOn(d.orbits, 'focus')
    for (let i = 0; i < 3; i++) frameBlur(d.orbits)
    await settle()
    expect(focus).not.toHaveBeenCalled()
    expect(hollow.stop).not.toHaveBeenCalled()
  })

  it('does nothing when the owner left the page or moved to another window', async () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'hollow'
    const focus = vi.spyOn(d.hollow, 'focus')
    frameBlur(d.hollow)
    pageHasFocus = false
    await settle()
    pageHasFocus = true
    frameBlur(d.hollow)
    focusedWindow = 'np'
    await settle()
    expect(focus).not.toHaveBeenCalled()
  })
})

describe('keyboardGuard: another window comes to the front by itself', () => {
  it('takes the keyboard out of the URL app that was in front and gives it to the new window', () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    d.typing.focus()
    focusedWindow = 'hollow'
    windowsChanged?.() // Hollow came to the front
    const frameBlurred = vi.spyOn(d.hollow, 'blur')
    const typing = vi.spyOn(d.typing, 'focus')
    focusedWindow = 'np'
    windowsChanged?.()
    expect(frameBlurred).toHaveBeenCalled()
    expect(typing).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('leaves the keyboard alone when the window in front was not a URL app', () => {
    const d = desktop()
    const guard = makeGuard()
    register(guard, d.hollow, 'hollow', 'Hollow')
    focusedWindow = 'calc'
    windowsChanged?.()
    const typing = vi.spyOn(d.typing, 'focus')
    const frameBlurred = vi.spyOn(d.hollow, 'blur')
    focusedWindow = 'np'
    windowsChanged?.()
    expect(frameBlurred).not.toHaveBeenCalled()
    expect(typing).not.toHaveBeenCalled()
  })
})
