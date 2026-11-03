// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { wheelMessage } from './pointerInput'

const wheel = (init: WheelEventInit & { wheelDeltaX?: number; wheelDeltaY?: number }) =>
  Object.assign(new WheelEvent('wheel', init), {
    wheelDeltaX: init.wheelDeltaX ?? 0,
    wheelDeltaY: init.wheelDeltaY ?? 0,
  })

describe('what a wheel event becomes for a Linux app', () => {
  it('reads a mouse wheel as whole notches', () => {
    expect(wheelMessage(wheel({ deltaY: 100, wheelDeltaY: -120 }))).toEqual({
      dx: 0,
      dy: 15,
      v120x: 0,
      v120y: 120,
      wheel: true,
    })
  })

  it('reads lines as a third of a notch each', () => {
    const m = wheelMessage(wheel({ deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE }))
    expect(m).toMatchObject({ dy: 15, v120y: 120, wheel: true })
  })

  it('passes a touchpad through as smooth pixels', () => {
    expect(wheelMessage(wheel({ deltaX: 4, deltaY: -7, wheelDeltaY: 9 }))).toEqual({
      dx: 4,
      dy: -7,
      v120x: 0,
      v120y: 0,
      wheel: false,
    })
  })
})
