import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPasteKey,
  LinuxClipboard,
  MAX_CLIPBOARD_BYTES,
  PasteGate,
  type ClipboardAccess,
} from './clipboard'

const key = (
  code: string,
  mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}
) => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
})

/** The browser's clipboard, as a page sees it. */
function fakeClipboard(initial = '') {
  const state = { text: initial, reads: 0, refuseRead: false, refuseWrite: false }
  const access: ClipboardAccess = {
    readText: () => {
      state.reads++
      return state.refuseRead
        ? Promise.reject(new DOMException('denied'))
        : Promise.resolve(state.text)
    },
    writeText: (text: string) => {
      if (state.refuseWrite) return Promise.reject(new DOMException('not focused'))
      state.text = text
      return Promise.resolve()
    },
  }
  return { state, access }
}

afterEach(() => vi.useRealTimers())

describe('paste keys', () => {
  it('are Ctrl+V, Ctrl+Shift+V and Shift+Insert', () => {
    expect(isPasteKey(key('KeyV', { ctrlKey: true }))).toBe(true)
    expect(isPasteKey(key('KeyV', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isPasteKey(key('Insert', { shiftKey: true }))).toBe(true)
  })

  it('are not V alone, Ctrl+Insert (copy), or anything with Alt or Meta', () => {
    expect(isPasteKey(key('KeyV'))).toBe(false)
    expect(isPasteKey(key('Insert', { ctrlKey: true }))).toBe(false)
    expect(isPasteKey(key('Insert', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isPasteKey(key('KeyV', { ctrlKey: true, altKey: true }))).toBe(false)
    expect(isPasteKey(key('KeyV', { metaKey: true }))).toBe(false)
    expect(isPasteKey(key('KeyC', { ctrlKey: true }))).toBe(false)
  })
})

describe('the clipboard with the Linux apps', () => {
  it("writes a Linux app's copy to the clipboard", async () => {
    const c = fakeClipboard('old')
    await new LinuxClipboard(() => c.access).fromLinux('copied in Firefox')
    expect(c.state.text).toBe('copied in Firefox')
  })

  it('hands a paste the text copied outside the Linux apps', async () => {
    const c = fakeClipboard('copied outside')
    expect(await new LinuxClipboard(() => c.access).forPaste()).toBe('copied outside')
  })

  it("leaves the Linux side alone when the clipboard still holds the app's own copy", async () => {
    const c = fakeClipboard()
    const bridge = new LinuxClipboard(() => c.access)
    await bridge.fromLinux('copied in Firefox')
    expect(await bridge.forPaste()).toBeNull()
    // Copied outside afterwards: that one crosses, once.
    c.state.text = 'copied outside'
    expect(await bridge.forPaste()).toBe('copied outside')
    expect(await bridge.forPaste()).toBeNull()
  })

  it("doesn't overwrite a Linux copy the clipboard refused with older text", async () => {
    const c = fakeClipboard()
    const bridge = new LinuxClipboard(() => c.access)
    c.state.text = 'older'
    expect(await bridge.forPaste()).toBe('older')
    c.state.refuseWrite = true
    await bridge.fromLinux('newer, copied in a Linux app')
    expect(c.state.text).toBe('older')
    expect(await bridge.forPaste()).toBeNull()
  })

  it('lets the paste through with nothing when the read is refused, empty, too large or too slow', async () => {
    vi.useFakeTimers()
    const c = fakeClipboard('')
    const bridge = new LinuxClipboard(() => c.access)
    expect(await bridge.forPaste()).toBeNull()
    c.state.refuseRead = true
    expect(await bridge.forPaste()).toBeNull()
    c.state.refuseRead = false
    c.state.text = 'ș'.repeat(MAX_CLIPBOARD_BYTES / 2 + 1)
    expect(await bridge.forPaste()).toBeNull()

    const waiting = new LinuxClipboard(() => ({
      readText: () => new Promise<string>(() => {}),
      writeText: c.access.writeText,
    }))
    const pending = waiting.forPaste(1000)
    vi.advanceTimersByTime(1000)
    expect(await pending).toBeNull()
  })

  it('does nothing without a clipboard', async () => {
    const bridge = new LinuxClipboard(() => undefined)
    await bridge.fromLinux('x')
    expect(await bridge.forPaste()).toBeNull()
  })
})

describe('keys to the Linux apps around a paste', () => {
  it('sends the text before the paste key, and holds the keys after it until then', async () => {
    const sent: object[] = []
    let answer = (_: string | null) => {}
    const gate = new PasteGate((m) => sent.push(m), {
      forPaste: () => new Promise((resolve) => (answer = resolve)),
    })
    gate.key({ type: 'key', keycode: 29, pressed: true }) // Ctrl
    gate.paste({ type: 'key', keycode: 47, pressed: true }) // V
    gate.key({ type: 'key', keycode: 47, pressed: false })
    expect(sent).toEqual([{ type: 'key', keycode: 29, pressed: true }])

    answer('from the clipboard')
    await Promise.resolve()
    await Promise.resolve()
    expect(sent).toEqual([
      { type: 'key', keycode: 29, pressed: true },
      { type: 'clipboard', text: 'from the clipboard' },
      { type: 'key', keycode: 47, pressed: true },
      { type: 'key', keycode: 47, pressed: false },
    ])

    // Afterwards keys go at once again.
    gate.key({ type: 'key', keycode: 29, pressed: false })
    expect(sent.at(-1)).toEqual({ type: 'key', keycode: 29, pressed: false })
  })

  it('sends just the key when there is nothing to hand over', async () => {
    const sent: object[] = []
    const gate = new PasteGate((m) => sent.push(m), { forPaste: () => Promise.resolve(null) })
    gate.paste({ type: 'key', keycode: 47, pressed: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(sent).toEqual([{ type: 'key', keycode: 47, pressed: true }])
  })

  it('reads once for a second paste pressed while the first reads', async () => {
    const sent: object[] = []
    const forPaste = vi.fn(() => Promise.resolve('text'))
    const gate = new PasteGate((m) => sent.push(m), { forPaste })
    gate.paste({ type: 'key', keycode: 47, pressed: true })
    gate.key({ type: 'key', keycode: 47, pressed: false })
    gate.paste({ type: 'key', keycode: 47, pressed: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(forPaste).toHaveBeenCalledTimes(1)
    expect(sent.filter((m) => (m as { type: string }).type === 'clipboard')).toHaveLength(1)
    expect(sent).toHaveLength(4)
  })
})
