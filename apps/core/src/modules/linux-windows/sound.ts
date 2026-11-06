/**
 * The session's Linux apps' sound, as the `/api/wayland` socket carries it:
 * a kind byte (3), the packet's sequence number (u32, little-endian), then
 * one Opus packet of 20 ms of 48 kHz stereo, the mix of every Linux app the
 * session runs. `apps/wayland-host/PROTOCOL.md` describes it once.
 *
 * Packets are decoded with WebCodecs and played through Web Audio a little
 * ahead of the audio clock, which absorbs the jitter of the trip. Browsers
 * keep a page silent until it has had a gesture: until then packets are
 * dropped, and the first press or key in the desktop starts the sound.
 */

export const WS_KIND_AUDIO = 3
const SAMPLE_RATE = 48_000
const CHANNELS = 2
/** Microseconds per packet, for the decoder's timestamps. */
const PACKET_US = 20_000
/**
 * How far ahead of the audio clock a new run of sound is scheduled, at
 * first. When the queue runs dry in the middle of a run (packets held up
 * behind a large frame, or by the host), the lead grows by
 * {@link LEAD_STEP_S}, up to {@link MAX_LEAD_S}, and shrinks back a step
 * after {@link LEAD_SETTLE_MS} without that.
 */
export const LEAD_S = 0.06
export const LEAD_STEP_S = 0.04
export const MAX_LEAD_S = 0.3
const LEAD_SETTLE_MS = 10_000
/** A packet that would play this much later than the lead is dropped, to catch up. */
export const DROP_AFTER_S = 0.2
/** A packet due sooner than this counts as late: the run starts over. */
const LATE_S = 0.005

export type SoundPacket = { sequence: number; packet: Uint8Array }

/** Parse a binary message; null for anything that isn't a sound packet. */
export function parseSound(message: ArrayBuffer): SoundPacket | null {
  if (message.byteLength < 6) return null
  const view = new DataView(message)
  if (view.getUint8(0) !== WS_KIND_AUDIO) return null
  return { sequence: view.getUint32(1, true), packet: new Uint8Array(message, 5) }
}

/**
 * When a packet plays, in the audio clock's seconds: right after the one
 * before when it follows it and that one is still ahead, else `lead` from
 * now (the first packet, after a gap, or after the buffer ran dry). Null
 * drops it: the queue is too far ahead (the server's clock ran faster than
 * the tab's).
 */
export function scheduleAt(
  now: number,
  next: number | null,
  follows: boolean,
  lead = LEAD_S
): number | null {
  if (!follows || next === null || next < now + LATE_S) return now + lead
  if (next > now + lead + DROP_AFTER_S) return null
  return next
}

/** The queue ran dry in the middle of a run: the packet came too late. */
export function ranDry(now: number, next: number | null, follows: boolean): boolean {
  return follows && next !== null && next < now + LATE_S
}

type AudioContextFactory = () => AudioContext

/** The session's sound, played in this tab. */
export class LinuxSound {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private decoder: AudioDecoder | null = null
  /** When the queued sound ends, in the audio clock's seconds. */
  private next: number | null = null
  /** The sequence number of the last packet decoded. */
  private last: number | null = null
  /** A packet came: the next gesture starts the sound. */
  private heard = false
  /** The jitter buffer's lead now, and when it last had to grow. */
  private lead = LEAD_S
  private grewAt = 0
  private volume = 1
  /** Packets received and packets played, for checks. */
  private received = 0
  private played = 0
  /** When a packet last went to the speakers, by `performance.now()`. */
  private playedAt = -Infinity

  private readonly createContext: AudioContextFactory

  constructor(
    createContext: AudioContextFactory = () =>
      new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  ) {
    this.createContext = createContext
  }

  /** A binary message from the socket; false when it isn't sound. */
  receive(message: ArrayBuffer): boolean {
    const p = parseSound(message)
    if (!p) return false
    this.received++
    this.heard = true
    // Sound may start without a press once the page has had one; else the
    // next press does it.
    if (!this.ctx && navigator.userActivation?.hasBeenActive) this.start()
    if (this.ctx?.state !== 'running') return true
    const decoder = this.ensureDecoder()
    if (!decoder) return true
    try {
      decoder.decode(
        new EncodedAudioChunk({ type: 'key', timestamp: p.sequence * PACKET_US, data: p.packet })
      )
    } catch {
      // A closed decoder: a new one takes the next packet.
      this.decoder = null
    }
    return true
  }

  /** A press or a key in the desktop: the page may make sound now. */
  unlock(): void {
    if (!this.heard) return
    if (!this.ctx) this.start()
    else if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  /** The OS's volume for Linux apps' sound, 0 to 1. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    if (this.gain) this.gain.gain.value = this.volume
  }

  /** Linux apps' sound played within `ms`: it holds the idle cover off, as a playing `<audio>` does. */
  playing(ms = 3000): boolean {
    return performance.now() - this.playedAt < ms
  }

  /** For checks: what came, what played, and whether the browser lets it. */
  stats(): { received: number; played: number; lead: number; state: AudioContextState | 'none' } {
    return {
      received: this.received,
      played: this.played,
      lead: this.lead,
      state: this.ctx?.state ?? 'none',
    }
  }

  /** The socket closed: a new one starts a new run. */
  reset(): void {
    this.next = null
    this.last = null
  }

  dispose(): void {
    this.reset()
    try {
      if (this.decoder?.state !== 'closed') this.decoder?.close()
    } catch {
      // Already closed.
    }
    this.decoder = null
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.gain = null
    this.heard = false
  }

  private start(): void {
    if (typeof AudioDecoder === 'undefined' || typeof AudioContext === 'undefined') return
    try {
      this.ctx = this.createContext()
    } catch {
      return
    }
    this.gain = this.ctx.createGain()
    this.gain.gain.value = this.volume
    this.gain.connect(this.ctx.destination)
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  private ensureDecoder(): AudioDecoder | null {
    if (this.decoder && this.decoder.state !== 'closed') return this.decoder
    if (typeof AudioDecoder === 'undefined') return null
    const decoder = new AudioDecoder({
      output: (data) => this.play(data),
      error: () => {
        if (this.decoder === decoder) this.decoder = null
      },
    })
    decoder.configure({ codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS })
    this.decoder = decoder
    return decoder
  }

  private play(data: AudioData): void {
    const ctx = this.ctx
    const gain = this.gain
    try {
      if (!ctx || !gain) return
      const sequence = Math.round(data.timestamp / PACKET_US)
      const follows = this.last !== null && sequence === this.last + 1
      this.last = sequence
      const now = performance.now()
      if (ranDry(ctx.currentTime, this.next, follows)) {
        this.lead = Math.min(MAX_LEAD_S, this.lead + LEAD_STEP_S)
        this.grewAt = now
      } else if (this.lead > LEAD_S && now - this.grewAt > LEAD_SETTLE_MS) {
        this.lead = Math.max(LEAD_S, this.lead - LEAD_STEP_S)
        this.grewAt = now
      }
      const when = scheduleAt(ctx.currentTime, this.next, follows, this.lead)
      if (when === null) return
      const buffer = ctx.createBuffer(CHANNELS, data.numberOfFrames, data.sampleRate)
      for (let c = 0; c < CHANNELS; c++) {
        const plane = new Float32Array(data.numberOfFrames)
        data.copyTo(plane, {
          planeIndex: Math.min(c, data.numberOfChannels - 1),
          format: 'f32-planar',
        })
        buffer.copyToChannel(plane, c)
      }
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      source.start(when)
      this.next = when + buffer.duration
      this.played++
      this.playedAt = now
    } catch {
      // A browser that can't convert the decoder's output plays nothing.
    } finally {
      data.close()
    }
  }
}

export const linuxSound = new LinuxSound()
