// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { topVisibleWindowId, openWindows } = vi.hoisted(() => ({
  topVisibleWindowId: vi.fn<() => string | null>(),
  openWindows: { ids: [] as string[] },
}))
vi.mock('../../store/windowStore', () => ({
  topVisibleWindowId,
  useWindowStore: { getState: () => ({ windows: openWindows.ids.map((id) => ({ id })) }) },
}))

import {
  focusIntoNewWindowSoon,
  focusIntoWindow,
  focusIntoWindowSoon,
  forgetWindowFocus,
  openWithKeyboard,
  rememberWindowFocus,
} from './focusIntoWindow'

/**
 * Brief 174: a window raised from the taskbar or Alt+Tab gets the keyboard.
 * The order is the brief's: where focus last was in the window, then the first
 * focusable element, then the content area itself. Plain DOM fixtures shaped
 * like Window.tsx's (root with `data-window-id`, title bar, content area); no
 * window is rendered.
 */

/** A window as Window.tsx lays it out; `body` is the content area's HTML. */
function mountWindow(id: string, body: string): { root: HTMLElement; content: HTMLElement } {
  const root = document.createElement('div')
  root.setAttribute('data-window-id', id)
  root.innerHTML = `
    <div class="titlebar"><button title="Minimize">_</button></div>
    <div data-window-content="" tabindex="-1">${body}</div>
  `
  document.body.appendChild(root)
  return { root, content: root.querySelector<HTMLElement>('[data-window-content]')! }
}

function taskbarButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = 'task'
  document.body.appendChild(button)
  button.focus()
  return button
}

beforeEach(() => {
  topVisibleWindowId.mockReset()
  openWindows.ids = []
})

afterEach(() => {
  forgetWindowFocus('a')
  forgetWindowFocus('b')
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('focusIntoWindow: the three-step order', () => {
  it('goes back to the element that last had focus in the window', () => {
    const { content } = mountWindow('a', '<button id="first">One</button><input id="cmd" />')
    const cmd = content.querySelector<HTMLInputElement>('#cmd')!
    rememberWindowFocus('a', cmd)
    taskbarButton()

    expect(focusIntoWindow('a')).toBe(cmd)
    expect(document.activeElement).toBe(cmd)
  })

  it('falls back to the first focusable element when the remembered one is gone', () => {
    const { content } = mountWindow('a', '<p>text</p><button id="first">One</button><input />')
    const gone = document.createElement('input')
    content.appendChild(gone)
    rememberWindowFocus('a', gone)
    gone.remove()
    taskbarButton()

    expect(focusIntoWindow('a')).toBe(content.querySelector('#first'))
  })

  it('skips disabled controls and elements taken out of the tab order', () => {
    const { content } = mountWindow(
      'a',
      '<button disabled>Off</button><div tabindex="-1">skip</div><input type="hidden" /><textarea id="ta"></textarea>'
    )
    taskbarButton()

    expect(focusIntoWindow('a')).toBe(content.querySelector('#ta'))
  })

  it('focuses the content area when nothing in it can take focus', () => {
    const { content } = mountWindow('a', '<canvas></canvas><p>nothing to focus</p>')
    taskbarButton()

    expect(focusIntoWindow('a')).toBe(content)
    expect(document.activeElement).toBe(content)
  })

  it("focuses a URL app's iframe", () => {
    const { content } = mountWindow(
      'a',
      '<div class="relative"><iframe title="Hollow"></iframe><div data-sandbox-shield=""></div></div>'
    )
    taskbarButton()

    expect(focusIntoWindow('a')).toBe(content.querySelector('iframe'))
  })

  it('never restores to the title bar', () => {
    const { root, content } = mountWindow('a', '<input id="cmd" />')
    // Window.tsx records only the content area's focus; the title bar's
    // Minimize is outside it and is never remembered.
    rememberWindowFocus('a', content)
    root.querySelector<HTMLButtonElement>('[title="Minimize"]')!.focus()
    taskbarButton()

    expect(focusIntoWindow('a')).toBe(content.querySelector('#cmd'))
  })

  it('leaves focus alone when it is already in the window', () => {
    const { content } = mountWindow('a', '<button>One</button><input id="cmd" />')
    const cmd = content.querySelector<HTMLInputElement>('#cmd')!
    cmd.focus()

    expect(focusIntoWindow('a')).toBeNull()
    expect(document.activeElement).toBe(cmd)
  })

  it("leaves focus alone when it is in the window's own portaled dialog", () => {
    mountWindow('a', '<input id="cmd" />')
    const dialogInput = document.createElement('input')
    document.body.appendChild(dialogInput)
    rememberWindowFocus('a', dialogInput)
    dialogInput.focus()

    expect(focusIntoWindow('a')).toBeNull()
    expect(document.activeElement).toBe(dialogInput)
  })

  it('does nothing for a window that is not on the page', () => {
    const button = taskbarButton()

    expect(focusIntoWindow('missing')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

describe('focusIntoWindowSoon', () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  })

  const flushFrame = () => {
    const pending = frames
    frames = []
    for (const cb of pending) cb(0)
  }

  it('waits a frame, then moves focus into the focused window', () => {
    const { content } = mountWindow('a', '<input id="cmd" />')
    const button = taskbarButton()
    topVisibleWindowId.mockReturnValue('a')

    focusIntoWindowSoon('a')
    expect(document.activeElement).toBe(button)

    flushFrame()
    expect(document.activeElement).toBe(content.querySelector('#cmd'))
  })

  it('does nothing behind the cover screen (topVisibleWindowId is null)', () => {
    mountWindow('a', '<input id="cmd" />')
    const button = taskbarButton()
    topVisibleWindowId.mockReturnValue(null)

    focusIntoWindowSoon('a')
    flushFrame()
    expect(document.activeElement).toBe(button)
  })

  it('does nothing when another window came to the front in that frame', () => {
    mountWindow('a', '<input id="cmd" />')
    mountWindow('b', '<input id="other" />')
    const button = taskbarButton()
    topVisibleWindowId.mockReturnValue('b')

    focusIntoWindowSoon('a')
    flushFrame()
    expect(document.activeElement).toBe(button)
  })
})

/** Brief 180: a new window takes the keyboard from its own mount. */
describe('focusIntoNewWindowSoon', () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      // Handles are 1-based push results; a cancelled slot never runs.
      frames[handle - 1] = () => {}
    })
  })

  const flushFrame = () => {
    const pending = frames
    frames = []
    for (const cb of pending) cb(0)
  }

  it('waits two frames, then puts the keyboard in the new window', () => {
    const { content } = mountWindow('a', '<input id="cmd" />')
    const start = taskbarButton()
    topVisibleWindowId.mockReturnValue('a')

    focusIntoNewWindowSoon('a')
    flushFrame()
    // The launcher's own focus return gets the first frame.
    expect(document.activeElement).toBe(start)
    flushFrame()
    expect(document.activeElement).toBe(content.querySelector('#cmd'))
  })

  it("leaves the app's own first focus alone (CAD's command line)", () => {
    const { content } = mountWindow('a', '<button id="menu">File</button><input id="cmd" />')
    topVisibleWindowId.mockReturnValue('a')
    const cmd = content.querySelector<HTMLInputElement>('#cmd')!
    cmd.focus()

    focusIntoNewWindowSoon('a')
    flushFrame()
    flushFrame()
    expect(document.activeElement).toBe(cmd)
  })

  it('moves nothing for a window that opened behind another', () => {
    mountWindow('a', '<input id="cmd" />')
    const start = taskbarButton()
    topVisibleWindowId.mockReturnValue('b')

    focusIntoNewWindowSoon('a')
    flushFrame()
    flushFrame()
    expect(document.activeElement).toBe(start)
  })

  it('moves nothing behind the cover screen', () => {
    mountWindow('a', '<input id="cmd" />')
    const start = taskbarButton()
    topVisibleWindowId.mockReturnValue(null)

    focusIntoNewWindowSoon('a')
    flushFrame()
    flushFrame()
    expect(document.activeElement).toBe(start)
  })

  it('moves nothing once cancelled (the window went away)', () => {
    mountWindow('a', '<input id="cmd" />')
    const start = taskbarButton()
    topVisibleWindowId.mockReturnValue('a')

    const cancel = focusIntoNewWindowSoon('a')
    flushFrame()
    cancel()
    flushFrame()
    expect(document.activeElement).toBe(start)
  })
})

describe('openWithKeyboard', () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  })

  it('puts the keyboard in a window that was already open and came up', () => {
    const { content } = mountWindow('a', '<input id="cmd" />')
    taskbarButton()
    openWindows.ids = ['a']
    topVisibleWindowId.mockReturnValue('a')

    expect(openWithKeyboard(() => 'a')).toBe('a')
    expect(frames).toHaveLength(1)
    frames[0](0)
    expect(document.activeElement).toBe(content.querySelector('#cmd'))
  })

  it('leaves a new window to its own mount', () => {
    openWindows.ids = ['a']
    expect(openWithKeyboard(() => 'new')).toBe('new')
    expect(frames).toHaveLength(0)
  })

  it('does nothing for a refused open', () => {
    openWindows.ids = ['a']
    expect(openWithKeyboard(() => '')).toBe('')
    expect(frames).toHaveLength(0)
  })
})
