import { evdevCode } from './keymap'
import { linuxKeys } from './clipboard'
import type { LinuxTextInput } from './linuxWindowsStore'
import { fieldShape, TextInputBridge, type FieldShape } from './textInput'

/**
 * How a tap in a Linux window raises the phone's keyboard.
 *
 * - `on-tap`: the tap itself focuses the hidden input, inside the tap's user
 *   activation, and it is blurred again when the app doesn't enable a field
 *   within {@link TAP_WAIT_MS}. Android raises the keyboard for it; a tap
 *   beside a field flashes the keyboard up and down.
 * - `after-enable`: the hidden input is focused when the app enables a field
 *   within {@link TAP_WAIT_MS} of the tap, after the round trip. No flash,
 *   but Chrome may refuse to raise the keyboard outside the tap's handler.
 *
 * `on-tap` unless this tab's localStorage says otherwise
 * (`imbatranim.linuxTouchFocus` = `after-enable`), to compare the two on a
 * phone without a rebuild.
 */
export type TouchFocus = 'on-tap' | 'after-enable'

export const TOUCH_FOCUS_KEY = 'imbatranim.linuxTouchFocus'

export function touchFocus(): TouchFocus {
  try {
    return localStorage.getItem(TOUCH_FOCUS_KEY) === 'after-enable' ? 'after-enable' : 'on-tap'
  } catch {
    return 'on-tap'
  }
}

/** How long after a tap the app's enable still raises the keyboard, or the tap's own focus waits for one. */
export const TAP_WAIT_MS = 1000

/** A press that moves farther or lasts longer is a drag or a long press, not a tap. */
const TAP_SLOP_PX = 12
const TAP_MAX_MS = 600

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * One Linux window's hidden input: an `<input>` (a `<textarea>` for a
 * multiline field) kept inside the window at the app's cursor, invisible and
 * out of the pointer's way, focused after a touch tap while the app has a
 * field enabled, so a phone raises its keyboard for it. Desktop keyboards
 * never come through it: a key with a physical code still goes as a key, from
 * the window's own key handler.
 */
export class HiddenTextInput {
  private el: Field
  private readonly holder: HTMLElement
  private readonly toplevel: number
  /** Where the toplevel's window geometry starts in its image: the canvas is shifted by it. */
  private readonly geometry: () => { x: number; y: number }
  private readonly bridge: TextInputBridge
  private state: LinuxTextInput | null = null
  private shape = ''
  private down: { x: number; y: number; at: number } | null = null
  private tapAt = -Infinity
  private waitTimer: ReturnType<typeof setTimeout> | null = null

  constructor(holder: HTMLElement, toplevel: number, geometry: () => { x: number; y: number }) {
    this.holder = holder
    this.toplevel = toplevel
    this.geometry = geometry
    this.bridge = new TextInputBridge(
      () => this.el,
      (m) => linuxKeys.key(m),
      toplevel
    )
    this.el = this.create('input')
    holder.appendChild(this.el)
  }

  /** The bridge, for tests. */
  get edits(): TextInputBridge {
    return this.bridge
  }

  /** The element, for tests and the walk. */
  get element(): Field {
    return this.el
  }

  private create(tag: 'input' | 'textarea'): Field {
    const el = document.createElement(tag)
    el.tabIndex = -1
    el.dataset.linuxTextInput = ''
    el.setAttribute('aria-label', 'Text for the Linux app')
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '2px',
      height: '1px',
      margin: '0',
      padding: '0',
      border: '0',
      outline: 'none',
      opacity: '0',
      pointerEvents: 'none',
      resize: 'none',
      overflow: 'hidden',
      background: 'transparent',
      color: 'transparent',
      caretColor: 'transparent',
      // Under 16px, some phones zoom the page to the field on focus.
      fontSize: '16px',
      whiteSpace: 'pre',
    })
    this.listen(el, true)
    return el
  }

  private drop(el: Field): void {
    this.listen(el, false)
    el.remove()
  }

  private listen(el: HTMLElement, on: boolean): void {
    if (on) {
      el.addEventListener('keydown', this.onKeyDown)
      el.addEventListener('keyup', this.onKeyUp)
      el.addEventListener('beforeinput', this.onBeforeInput)
      el.addEventListener('input', this.onInput)
      el.addEventListener('compositionstart', this.onCompositionStart)
      el.addEventListener('compositionupdate', this.onCompositionUpdate)
      el.addEventListener('compositionend', this.onCompositionEnd)
    } else {
      el.removeEventListener('keydown', this.onKeyDown)
      el.removeEventListener('keyup', this.onKeyUp)
      el.removeEventListener('beforeinput', this.onBeforeInput)
      el.removeEventListener('input', this.onInput)
      el.removeEventListener('compositionstart', this.onCompositionStart)
      el.removeEventListener('compositionupdate', this.onCompositionUpdate)
      el.removeEventListener('compositionend', this.onCompositionEnd)
    }
  }

  /**
   * A soft keyboard's keys come with no physical code (or as the IME's 229)
   * and stay here; a key with one bubbles on to the window's key handler,
   * which sends it as a key and keeps it out of the input, as without this.
   */
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) {
      e.stopPropagation()
      return
    }
    if (evdevCode(e.code) !== undefined) return
    e.stopPropagation()
    const code = this.bridge.softKey(e.key)
    if (code === undefined) return
    e.preventDefault()
    this.bridge.key(code)
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (evdevCode(e.code) === undefined) e.stopPropagation()
  }

  private readonly onBeforeInput = (e: InputEvent) => {
    e.stopPropagation()
    const r = this.bridge.beforeInput(e.inputType)
    if (r === null) return
    e.preventDefault()
    if (r !== 'drop') this.bridge.key(r)
  }

  private readonly onInput = (e: Event) => {
    e.stopPropagation()
    const ie = e as InputEvent
    this.bridge.input(ie.inputType ?? '', ie.data ?? null)
  }

  private readonly onCompositionStart = () => this.bridge.compositionStart()
  private readonly onCompositionUpdate = (e: CompositionEvent) =>
    this.bridge.compositionUpdate(e.data ?? '')
  private readonly onCompositionEnd = () => this.bridge.compositionEnd()

  private focused(): boolean {
    return document.activeElement === this.el
  }

  /**
   * The app's field with text-input focus, for any window (or none): this
   * window follows it when it is its own and enabled, and lets go otherwise.
   */
  update(state: LinuxTextInput | null): void {
    const mine = state && state.toplevel === this.toplevel && state.enabled ? state : null
    if (mine === this.state) {
      this.place()
      return
    }
    const fresh = !this.state
    this.state = mine
    if (!mine) {
      this.bridge.reset()
      this.lower()
      return
    }
    this.clearWait()
    if (fresh) this.bridge.reset()
    this.reshape(fieldShape(mine.purpose, mine.hints))
    this.place()
    this.bridge.setApp(mine)
    // The app enabled a field after a tap in this window.
    if (!this.focused() && !this.down && performance.now() - this.tapAt < TAP_WAIT_MS) this.raise()
  }

  /**
   * A touch press in the window, before it goes to the app. Returns true
   * when the window's own element mustn't take focus: the hidden input has
   * the keyboard, and keeps it unless the app lets go. A word still being
   * composed is committed where it is first, before the press moves the
   * app's cursor.
   */
  touchDown(e: { clientX: number; clientY: number }): boolean {
    this.down = { x: e.clientX, y: e.clientY, at: performance.now() }
    if (!this.focused()) return false
    if (this.bridge.composing) this.el.blur()
    return true
  }

  /** The touch lifted: if it was a tap, the keyboard comes up as {@link touchFocus} says. */
  touchUp(e: { clientX: number; clientY: number }): void {
    const d = this.down
    this.down = null
    if (!d) return
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
    if (moved > TAP_SLOP_PX || performance.now() - d.at > TAP_MAX_MS) return
    this.tapAt = performance.now()
    if (this.state) {
      this.raise()
      return
    }
    if (touchFocus() !== 'on-tap') return
    this.raise()
    this.clearWait()
    this.waitTimer = setTimeout(() => {
      this.waitTimer = null
      if (!this.state) this.lower()
    }, TAP_WAIT_MS)
  }

  /**
   * Focus the hidden input. Already focused, it is blurred first, so a
   * keyboard the owner put away comes back for the tap.
   */
  private raise(): void {
    if (this.focused()) this.el.blur()
    this.el.focus({ preventScroll: true })
    // For the walk: how long from the tap to the focus that raises the keyboard.
    this.el.dataset.tapToFocusMs = String(Math.round(performance.now() - this.tapAt))
  }

  /** The keyboard goes: the window's own element takes focus back. */
  private lower(): void {
    this.clearWait()
    if (this.focused()) this.holder.focus({ preventScroll: true })
  }

  private clearWait(): void {
    if (this.waitTimer) clearTimeout(this.waitTimer)
    this.waitTimer = null
  }

  /** The input's element and attributes for the field: its keyboard, and suggestions or none. */
  private reshape(shape: FieldShape): void {
    const key = JSON.stringify(shape)
    if (key === this.shape) return
    this.shape = key
    const tag = shape.multiline ? 'textarea' : 'input'
    if (this.el.tagName.toLowerCase() !== tag) {
      const wasFocused = this.focused()
      const old = this.el
      this.el = this.create(tag)
      this.holder.appendChild(this.el)
      this.drop(old)
      if (wasFocused) this.el.focus({ preventScroll: true })
    }
    const el = this.el
    if (el instanceof HTMLInputElement) el.type = shape.secret ? 'password' : 'text'
    setAttr(el, 'inputmode', shape.inputMode)
    setAttr(el, 'autocapitalize', shape.autocapitalize)
    setAttr(el, 'autocomplete', shape.suggestions ? null : 'off')
    setAttr(el, 'autocorrect', shape.suggestions ? null : 'off')
    setAttr(el, 'spellcheck', shape.suggestions ? null : 'false')
  }

  /** At the app's cursor, in the window body's coordinates (the canvas is shifted by the geometry). */
  private place(): void {
    const r = this.state?.rect
    const g = this.geometry()
    const s = this.el.style
    s.left = `${(r?.x ?? g.x) - g.x}px`
    s.top = `${(r?.y ?? g.y) - g.y}px`
    s.width = `${Math.max(2, r?.width ?? 0)}px`
    s.height = `${Math.max(1, r?.height ?? 0)}px`
  }

  dispose(): void {
    this.clearWait()
    this.bridge.reset()
    this.drop(this.el)
  }
}

function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) el.removeAttribute(name)
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}
