import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DROP_AFTER_S,
  LEAD_S,
  LEAD_STEP_S,
  LinuxSound,
  parseSound,
  ranDry,
  scheduleAt,
} from './sound'

function message(sequence: number, packet: number[], kind = 3): ArrayBuffer {
  const buf = new ArrayBuffer(5 + packet.length)
  const view = new DataView(buf)
  view.setUint8(0, kind)
  view.setUint32(1, sequence, true)
  new Uint8Array(buf, 5).set(packet)
  return buf
}

describe('parseSound', () => {
  it('reads the sequence number and the Opus packet', () => {
    const p = parseSound(message(513, [0xfc, 0xff, 0xfe]))
    expect(p?.sequence).toBe(513)
    expect([...(p?.packet ?? [])]).toEqual([0xfc, 0xff, 0xfe])
  })

  it('leaves frames and short messages alone', () => {
    expect(parseSound(message(1, [1, 2, 3], 2))).toBeNull()
    expect(parseSound(new ArrayBuffer(5))).toBeNull()
  })
})

describe('scheduleAt', () => {
  it('starts a new run a little ahead of the clock', () => {
    expect(scheduleAt(10, null, false)).toBe(10 + LEAD_S)
    // A packet after a gap starts over too, however far the queue reaches.
    expect(scheduleAt(10, 10.1, false)).toBe(10 + LEAD_S)
  })

  it('plays a following packet right after the one before', () => {
    expect(scheduleAt(10, 10.05, true)).toBe(10.05)
  })

  it('starts over when the queue ran dry, and drops what would play too late', () => {
    expect(ranDry(10, 9.99, true)).toBe(true)
    expect(scheduleAt(10, 9.99, true)).toBe(10 + LEAD_S)
    expect(scheduleAt(10, 10 + LEAD_S + DROP_AFTER_S + 0.01, true)).toBeNull()
  })

  it('starts a run further ahead when the lead has grown', () => {
    expect(scheduleAt(10, null, false, 0.14)).toBe(10.14)
    expect(scheduleAt(10, 10.3, true, 0.14)).toBe(10.3)
  })
})

/** Web Audio and WebCodecs, as far as LinuxSound uses them. */
function fakes() {
  const started: number[] = []
  const decoded: number[] = []
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }[] = []
  let output: ((d: AudioData) => void) | null = null
  const ctx = {
    state: 'suspended' as AudioContextState,
    currentTime: 5,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running'
    }),
    close: vi.fn(async () => undefined),
    createGain: () => {
      const node = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() }
      gains.push(node)
      return node
    },
    createBuffer: (_c: number, frames: number, rate: number) => ({
      duration: frames / rate,
      copyToChannel: vi.fn(),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: (when: number) => started.push(when),
    }),
  }
  class FakeDecoder {
    state = 'unconfigured'
    constructor(init: { output: (d: AudioData) => void }) {
      output = init.output
    }
    configure() {
      this.state = 'configured'
    }
    decode(chunk: { timestamp: number }) {
      decoded.push(chunk.timestamp)
      output?.({
        timestamp: chunk.timestamp,
        numberOfFrames: 960,
        numberOfChannels: 2,
        sampleRate: 48_000,
        copyTo: vi.fn(),
        close: vi.fn(),
      } as unknown as AudioData)
    }
    close() {
      this.state = 'closed'
    }
  }
  vi.stubGlobal('AudioDecoder', FakeDecoder)
  vi.stubGlobal('AudioContext', class {})
  vi.stubGlobal(
    'EncodedAudioChunk',
    class {
      timestamp: number
      constructor(init: { timestamp: number }) {
        this.timestamp = init.timestamp
      }
    }
  )
  const sound = new LinuxSound(() => ctx as unknown as AudioContext)
  return { sound, ctx, started, decoded, gains }
}

describe('LinuxSound', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stays silent until a press, then plays the packets that follow in a run', async () => {
    const { sound, ctx, started, decoded } = fakes()
    expect(sound.receive(message(1, [1]))).toBe(true)
    expect(decoded).toEqual([])
    sound.unlock()
    await Promise.resolve()
    expect(ctx.state).toBe('running')
    sound.receive(message(2, [1]))
    sound.receive(message(3, [1]))
    expect(decoded).toEqual([40_000, 60_000])
    expect(started[0]).toBeCloseTo(5 + LEAD_S)
    expect(started[1]).toBeCloseTo(5 + LEAD_S + 0.02)
    expect(sound.stats()).toEqual({
      received: 3,
      played: 2,
      lead: LEAD_S,
      volume: 1,
      state: 'running',
    })
    expect(sound.playing()).toBe(true)
  })

  it('starts a new run after a gap in the sequence', async () => {
    const { sound, started } = fakes()
    sound.receive(message(1, [1]))
    sound.unlock()
    await Promise.resolve()
    sound.receive(message(2, [1]))
    sound.receive(message(9, [1]))
    expect(started[1]).toBeCloseTo(started[0])
  })

  it('grows its lead when the queue runs dry in the middle of a run', async () => {
    const { sound, ctx, started } = fakes()
    sound.receive(message(1, [1]))
    sound.unlock()
    await Promise.resolve()
    sound.receive(message(2, [1]))
    // The next packet comes after its turn: the queue ran dry.
    ctx.currentTime = 6
    sound.receive(message(3, [1]))
    expect(sound.stats().lead).toBeCloseTo(LEAD_S + LEAD_STEP_S)
    expect(started[1]).toBeCloseTo(6 + LEAD_S + LEAD_STEP_S)
  })

  it('leaves frames to the window code', () => {
    const { sound } = fakes()
    expect(sound.receive(message(1, [1, 2, 3], 2))).toBe(false)
  })

  it('needs no press when nothing came', () => {
    const { sound, ctx } = fakes()
    sound.unlock()
    expect(ctx.resume).not.toHaveBeenCalled()
    expect(sound.stats().state).toBe('none')
  })

  it('plays at the OS volume, set before the sound starts or while it plays', async () => {
    const { sound, ctx, gains } = fakes()
    sound.setVolume(0.5)
    sound.receive(message(1, [1]))
    sound.unlock()
    await Promise.resolve()
    expect(gains[0].gain.value).toBe(0.5)
    sound.setVolume(0)
    expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      ctx.currentTime,
      expect.any(Number)
    )
    expect(sound.stats().volume).toBe(0)
    // The same volume again changes nothing.
    sound.setVolume(0)
    expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledTimes(1)
  })
})
