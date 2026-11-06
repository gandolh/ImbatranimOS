import type { LinuxTextInput } from './linuxWindowsStore'

/**
 * Text from a phone's keyboard into a Linux app's text field.
 *
 * A Linux window is a canvas, and Android raises its keyboard only for an
 * editable element, so each Linux window keeps a hidden input
 * (hiddenTextInput.ts). The app says what its focused field is through
 * text-input-v3 (the host's `text_input`): its purpose and hints pick the
 * input's keyboard, and its text and selection are mirrored into the input,
 * so the keyboard's suggestions, autocorrect and backspace see the current
 * word. What the keyboard then does to the input goes back as `text_edit`:
 * the text deleted around the cursor, the text committed, and the word still
 * being composed, which the app shows underlined.
 *
 * The edit is read from the input itself after each `input` and composition
 * event, against what the app is known to hold, rather than from each
 * event's own fields: Android keyboards replace, recompose and autocorrect
 * words in ways the events describe only partly, and the input's text is
 * always right. A word still being composed sits at the caret; the rest is
 * committed. Offsets and lengths on the wire are UTF-8 bytes.
 */

/** The `inputmode` a field's purpose asks for. */
export type InputMode = 'text' | 'email' | 'url' | 'tel' | 'numeric' | 'decimal'

const INPUT_MODES: Record<string, InputMode> = {
  email: 'email',
  url: 'url',
  phone: 'tel',
  digits: 'numeric',
  pin: 'numeric',
  number: 'decimal',
}

/**
 * The keyboard a field's purpose asks for: email, url, tel, numeric or
 * decimal, else text. A password gets none: `type=password` picks its
 * keyboard, and Chrome would let an explicit mode bring suggestions back.
 */
export function inputModeFor(purpose: string): InputMode | null {
  if (purpose === 'password') return null
  return INPUT_MODES[purpose] ?? 'text'
}

/** What the hidden input is for a field. */
export type FieldShape = {
  /** A `<textarea>` rather than an `<input>`. */
  multiline: boolean
  /** `type=password`: no suggestions, nothing learned. */
  secret: boolean
  inputMode: InputMode | null
  /** `autocapitalize`, or null for the browser's default. */
  autocapitalize: 'none' | 'sentences' | 'words' | 'characters' | null
  /** Suggestions and autocorrect stay on: off for secrets and terminals. */
  suggestions: boolean
}

export function fieldShape(purpose: string, hints: readonly string[]): FieldShape {
  const has = (h: string) => hints.includes(h)
  const secret =
    purpose === 'password' || purpose === 'pin' || has('sensitive_data') || has('hidden_text')
  const autocapitalize = has('lowercase')
    ? 'none'
    : has('uppercase')
      ? 'characters'
      : has('titlecase')
        ? 'words'
        : has('auto_capitalization')
          ? 'sentences'
          : purpose === 'terminal' || secret
            ? 'none'
            : null
  return {
    multiline: has('multiline'),
    secret,
    inputMode: secret && purpose !== 'pin' ? inputModeFor('password') : inputModeFor(purpose),
    autocapitalize,
    suggestions: !secret && purpose !== 'terminal',
  }
}

const encoder = new TextEncoder()

/** A string's length in UTF-8 bytes. */
export function utf8Length(text: string): number {
  return encoder.encode(text).length
}

/** The string index of a UTF-8 byte offset, pulled back to a character's start. */
export function byteToIndex(text: string, bytes: number): number {
  let b = 0
  let i = 0
  while (i < text.length) {
    const cp = text.codePointAt(i) ?? 0
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    if (b + size > bytes) break
    b += size
    i += cp > 0xffff ? 2 : 1
  }
  return i
}

/** Text with a selection, in string indices (start ≤ end). */
export type Mirror = { text: string; start: number; end: number }

/** What changed from a mirror's text to the next: the parts around the selection, and what took their place. */
export type Change = {
  /** Where the change starts, in both texts. */
  at: number
  /** Removed before the selection, the selection itself, and after it. */
  before: string
  selected: string
  after: string
  /** What came in their place. */
  commit: string
}

const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff

/**
 * The change from `old` to `next`, as text-input-v3 can say it: a stretch
 * around the old selection is replaced. The stretch holds the selection
 * whole, and never splits a character. Null when nothing changed.
 */
export function diffText(old: Mirror, next: string): Change | null {
  const o = old.text
  if (o === next) return null
  const s0 = Math.min(old.start, old.end, o.length)
  const s1 = Math.min(Math.max(old.start, old.end), o.length)
  let p = 0
  const maxP = Math.min(s0, next.length)
  while (p < maxP && o.charCodeAt(p) === next.charCodeAt(p)) p++
  if (p > 0 && isLowSurrogate(o.charCodeAt(p))) p--
  let q = 0
  const maxQ = Math.min(o.length - s1, next.length - p)
  while (q < maxQ && o.charCodeAt(o.length - 1 - q) === next.charCodeAt(next.length - 1 - q)) q++
  if (q > 0 && isLowSurrogate(o.charCodeAt(o.length - q))) q--
  return {
    at: p,
    before: o.slice(p, s0),
    selected: o.slice(s0, s1),
    after: o.slice(s1, o.length - q),
    commit: next.slice(p, next.length - q),
  }
}

/**
 * Where the word being composed sits in the input's value: the copy of
 * `text` that ends at the caret, else the one around it. Not found, the
 * composition is empty at the caret, and everything counts as committed.
 */
export function compositionRange(
  value: string,
  caret: number,
  text: string
): { start: number; end: number } {
  if (text) {
    if (caret >= text.length && value.slice(caret - text.length, caret) === text)
      return { start: caret - text.length, end: caret }
    const at = value.lastIndexOf(text, caret)
    if (at >= 0 && at + text.length >= caret) return { start: at, end: at + text.length }
  }
  return { start: caret, end: caret }
}

/** The tab's edit of the field, as the backend takes it (`text_edit`). */
export type TextEditMessage = {
  type: 'text_edit'
  toplevel: number
  delete?: { before: number; after: number }
  commit?: string
  preedit?: { text: string; cursor_begin: number; cursor_end: number }
}

/** Linux key codes the hidden input sends as keys. */
const KEY_ENTER = 28
const KEY_BACKSPACE = 14
const KEY_DELETE = 111

/** Keys a soft keyboard sends without a physical code that still go as keys. */
const SOFT_KEYS: Record<string, number> = {
  Enter: KEY_ENTER,
  Tab: 15,
  Escape: 1,
  ArrowUp: 103,
  ArrowLeft: 105,
  ArrowRight: 106,
  ArrowDown: 108,
}

/**
 * A change of the app's text the tab didn't make waits this long after the
 * tab's last edit before it is mirrored into the input: until then it may be
 * the app's answer to an older edit, and writing it into the input would
 * undo what was typed since. A phone's round trip is about 120-250 ms.
 */
export const SETTLE_MS = 500

/** The input the bridge reads and writes: an `<input>` or a `<textarea>`. */
export type TextField = Pick<
  HTMLInputElement,
  'value' | 'selectionStart' | 'selectionEnd' | 'setSelectionRange'
>

/**
 * Between one hidden input and the app's field: mirrors the app's text into
 * the input, and turns what the keyboard does to the input into edits.
 */
export class TextInputBridge {
  private readonly field: () => TextField
  private readonly send: (message: object) => void
  private readonly toplevel: number
  /** What the app holds, as far as the tab knows: its text and selection. */
  private model: Mirror = { text: '', start: 0, end: 0 }
  private app: LinuxTextInput | null = null
  /** A word is being composed, and its text so far. */
  composing = false
  private compText = ''
  private sentPreedit = ''
  private lastEditAt = -Infinity
  private settleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(field: () => TextField, send: (message: object) => void, toplevel: number) {
    this.field = field
    this.send = send
    this.toplevel = toplevel
  }

  /** Another field, or none: start over. */
  reset(): void {
    this.model = { text: '', start: 0, end: 0 }
    this.app = null
    this.composing = false
    this.compText = ''
    this.sentPreedit = ''
    this.lastEditAt = -Infinity
    this.clearSettle()
  }

  /**
   * The app's latest state of the field. The same text is mirrored at once
   * (a tap moved the cursor); other text when the owner isn't composing and
   * the last edit has had time to come back.
   */
  setApp(state: LinuxTextInput): void {
    this.app = state
    this.tryMirror()
  }

  private clearSettle(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.settleTimer = null
  }

  private tryMirror(): void {
    this.clearSettle()
    const s = this.app
    if (!s?.enabled || this.composing) return
    const target = mirrorOf(s)
    const wait = this.lastEditAt + SETTLE_MS - performance.now()
    if (target.text === this.model.text || wait <= 0) {
      this.mirror(target)
      return
    }
    this.settleTimer = setTimeout(() => this.tryMirror(), wait)
  }

  private mirror(m: Mirror): void {
    const el = this.field()
    if (el.value !== m.text) el.value = m.text
    if (el.selectionStart !== m.start || el.selectionEnd !== m.end)
      el.setSelectionRange(m.start, m.end)
    this.model = m
  }

  compositionStart(): void {
    this.composing = true
    this.compText = ''
  }

  compositionUpdate(data: string): void {
    this.compText = data
  }

  compositionEnd(): void {
    this.composing = false
    this.compText = ''
    this.sync()
    // An app state held back while the word was composed.
    this.tryMirror()
  }

  /** An `input` event: the input's text changed. */
  input(inputType: string, data: string | null): void {
    if (this.composing && inputType === 'insertCompositionText' && data !== null)
      this.compText = data
    this.sync()
  }

  /**
   * A `beforeinput` the input mustn't handle itself: a line break goes to the
   * app as Enter, and the input's own undo would undo nothing in the app.
   * Returns the key to send, 'drop' to cancel it, or null to let it be.
   */
  beforeInput(inputType: string): number | 'drop' | null {
    if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') return KEY_ENTER
    if (inputType === 'historyUndo' || inputType === 'historyRedo') return 'drop'
    // A delete with nothing in the input to delete (an empty field, or an
    // app that doesn't say its text), when the keyboard sends it without a
    // key: the app's own key does it.
    if (inputType === 'deleteContentBackward') return this.softKey('Backspace') ?? null
    if (inputType === 'deleteContentForward') return this.softKey('Delete') ?? null
    return null
  }

  /**
   * A soft keyboard's key with no physical code that goes to the app as a
   * key: Enter, Tab, Escape and the arrows, and Backspace or Delete when the
   * input has nothing for them to delete (an empty field, or an app that
   * doesn't say its text).
   */
  softKey(key: string): number | undefined {
    const code = SOFT_KEYS[key]
    if (code !== undefined) return code
    const el = this.field()
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (key === 'Backspace' && start === 0 && end === 0) return KEY_BACKSPACE
    if (key === 'Delete' && start === end && end === el.value.length) return KEY_DELETE
    return undefined
  }

  /** A key press and release, in order with the edits. */
  key(keycode: number): void {
    this.send({ type: 'key', keycode, pressed: true })
    this.send({ type: 'key', keycode, pressed: false })
  }

  /** Tell the app what the keyboard changed since the model. */
  private sync(): void {
    const el = this.field()
    const value = el.value
    const caret = el.selectionEnd ?? value.length
    let committed = value
    let preedit: TextEditMessage['preedit']
    if (this.composing) {
      const r = compositionRange(value, caret, this.compText)
      committed = value.slice(0, r.start) + value.slice(r.end)
      const text = value.slice(r.start, r.end)
      if (text) {
        const at = utf8Length(text.slice(0, Math.min(Math.max(caret - r.start, 0), text.length)))
        preedit = { text, cursor_begin: at, cursor_end: at }
      }
    }
    const change = diffText(this.model, committed)
    if (!change && (preedit?.text ?? '') === this.sentPreedit) return
    const message: TextEditMessage = { type: 'text_edit', toplevel: this.toplevel }
    if (change) {
      const before = utf8Length(change.before)
      const after = utf8Length(change.after)
      if (before || after) message.delete = { before, after }
      if (change.commit) message.commit = change.commit
      // A selection removed with nothing in its place: a commit would need
      // text, so the app's own Backspace removes it, before the rest.
      else if (change.selected) this.key(KEY_BACKSPACE)
    }
    if (preedit) message.preedit = preedit
    if (message.delete || message.commit || preedit || this.sentPreedit) this.send(message)
    this.sentPreedit = preedit?.text ?? ''
    this.lastEditAt = performance.now()
    if (change) {
      // Where the app's cursor goes: after what it committed.
      const at = change.at + change.commit.length
      this.model = { text: committed, start: at, end: at }
    }
    // An app that doesn't say its text: keep the input empty, so the next
    // Backspace on the keyboard comes as a key the app can act on.
    if (!this.composing && this.app?.text === null && el.value !== '') {
      el.value = ''
      this.model = { text: '', start: 0, end: 0 }
    }
  }
}

/** The app's text and selection, in string indices. */
function mirrorOf(s: LinuxTextInput): Mirror {
  if (s.text === null) return { text: '', start: 0, end: 0 }
  const a = byteToIndex(s.text, Math.min(s.cursor, s.anchor))
  const b = byteToIndex(s.text, Math.max(s.cursor, s.anchor))
  return { text: s.text, start: a, end: b }
}
