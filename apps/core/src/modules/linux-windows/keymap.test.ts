import { describe, expect, it } from 'vitest'
import { evdevButton, evdevCode } from './keymap'

describe('the Linux key and button codes', () => {
  it('maps physical keys to evdev codes', () => {
    expect(evdevCode('Escape')).toBe(1)
    expect(evdevCode('KeyA')).toBe(30)
    expect(evdevCode('Enter')).toBe(28)
    expect(evdevCode('ControlLeft')).toBe(29)
    expect(evdevCode('ArrowUp')).toBe(103)
    expect(evdevCode('Tab')).toBe(15)
    expect(evdevCode('Backspace')).toBe(14)
    expect(evdevCode('MediaPlayPause')).toBeUndefined()
  })

  it('maps mouse buttons to BTN_ codes, right and middle swapped from the DOM order', () => {
    expect(evdevButton(0)).toBe(0x110)
    expect(evdevButton(1)).toBe(0x112)
    expect(evdevButton(2)).toBe(0x111)
    expect(evdevButton(7)).toBeUndefined()
  })
})
