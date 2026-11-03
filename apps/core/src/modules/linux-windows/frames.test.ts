import { describe, expect, it } from 'vitest'
import { parseFrame, ENC_WEBP_LOSSLESS } from './frames'

/** A frame as the socket carries it: kind 2, then the body PROTOCOL.md lays out. */
function frameBytes(rects: { x: number; y: number; w: number; h: number; data: number[] }[]) {
  const size = 15 + rects.reduce((n, r) => n + 21 + r.data.length, 0)
  const buf = new ArrayBuffer(size)
  const v = new DataView(buf)
  v.setUint8(0, 2)
  v.setUint32(1, 9, true)
  v.setUint32(5, 640, true)
  v.setUint32(9, 480, true)
  v.setUint16(13, rects.length, true)
  let off = 15
  for (const r of rects) {
    ;[r.x, r.y, r.w, r.h].forEach((n, i) => v.setUint32(off + i * 4, n, true))
    v.setUint8(off + 16, ENC_WEBP_LOSSLESS)
    v.setUint32(off + 17, r.data.length, true)
    new Uint8Array(buf, off + 21, r.data.length).set(r.data)
    off += 21 + r.data.length
  }
  return buf
}

describe('parseFrame', () => {
  it('reads the toplevel, the size and each rectangle', () => {
    const f = parseFrame(
      frameBytes([
        { x: 1, y: 2, w: 3, h: 4, data: [7, 8] },
        { x: 5, y: 6, w: 7, h: 8, data: [] },
      ])
    )
    expect(f).not.toBeNull()
    expect(f!.toplevel).toBe(9)
    expect([f!.width, f!.height]).toEqual([640, 480])
    expect(f!.rects.map((r) => [r.x, r.y, r.w, r.h, r.encoding, [...r.data]])).toEqual([
      [1, 2, 3, 4, ENC_WEBP_LOSSLESS, [7, 8]],
      [5, 6, 7, 8, ENC_WEBP_LOSSLESS, []],
    ])
  })

  it('refuses a truncated frame or another kind', () => {
    const whole = frameBytes([{ x: 0, y: 0, w: 1, h: 1, data: [1, 2, 3] }])
    expect(parseFrame(whole.slice(0, whole.byteLength - 1))).toBeNull()
    const other = whole.slice(0)
    new DataView(other).setUint8(0, 1)
    expect(parseFrame(other)).toBeNull()
  })
})
