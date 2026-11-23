import { create } from "zustand";
import { ENC_COPY, ENC_DEFLATE_RGBA, ENC_JPEG, ENC_VP8, ENC_WEBP_LOSSLESS, type Frame } from "./frames";

/**
 * "Show stream stats" (Settings → Linux apps): each Linux window shows which rectangles of its frames came and
 * how each was encoded, with frames a second, kB a second, each encoding's share of the bytes and the tab's
 * decode time over the last second. Everything here is read from the frames the tab already gets; nothing is
 * recorded while the switch is off.
 */

const KEY = "imbatranimos:linux-stream-stats";

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

/** The switch, kept per machine. */
export const useStreamStatsSwitch = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: stored(),
  setOn: (on) => {
    try {
      if (on) localStorage.setItem(KEY, "on");
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: the switch lasts this page's life */
    }
    if (!on) streamStats.clear();
    set({ on });
  },
}));

/** The encodings, as the overlay names them. */
export const ENCODING_NAMES: Record<number, string> = {
  [ENC_DEFLATE_RGBA]: "Deflate",
  [ENC_WEBP_LOSSLESS]: "WebP",
  [ENC_JPEG]: "JPEG",
  [ENC_VP8]: "VP8",
  [ENC_COPY]: "Moved",
};

/** How long a rectangle's outline shows, and the span the numbers cover. */
export const FLASH_MS = 500;
export const WINDOW_MS = 1000;

type Sample = { at: number; bytes: number; byEncoding: Map<number, number>; decodeMs: number };
export type FlashRect = { x: number; y: number; w: number; h: number; encoding: number; at: number };

export type StreamSummary = {
  fps: number;
  kBps: number;
  /** Each encoding's share of the bytes, from 0 to 1, largest first. */
  shares: { encoding: number; share: number }[];
  /** The tab's mean time to decode and draw a frame, in milliseconds. */
  decodeMs: number;
};

/** The numbers over the samples of the last {@link WINDOW_MS} before `now`. */
export function summarize(samples: readonly Sample[], now: number): StreamSummary {
  const recent = samples.filter((s) => now - s.at <= WINDOW_MS);
  const bytes = recent.reduce((sum, s) => sum + s.bytes, 0);
  const byEncoding = new Map<number, number>();
  for (const s of recent) for (const [e, b] of s.byEncoding) byEncoding.set(e, (byEncoding.get(e) ?? 0) + b);
  const shares = [...byEncoding]
    .map(([encoding, b]) => ({ encoding, share: bytes > 0 ? b / bytes : 0 }))
    .sort((a, b) => b.share - a.share);
  return {
    fps: recent.length / (WINDOW_MS / 1000),
    kBps: bytes / 1000 / (WINDOW_MS / 1000),
    shares,
    decodeMs: recent.length > 0 ? recent.reduce((sum, s) => sum + s.decodeMs, 0) / recent.length : 0,
  };
}

/** The frames of each toplevel, recorded while the switch is on. */
class StreamStats {
  private readonly byToplevel = new Map<number, { samples: Sample[]; flashes: FlashRect[] }>();

  /** One painted frame: its rectangles and bytes, and how long the tab took to decode and draw it. */
  record(frame: Frame, decodeMs: number, now: number): void {
    let t = this.byToplevel.get(frame.toplevel);
    if (!t) {
      t = { samples: [], flashes: [] };
      this.byToplevel.set(frame.toplevel, t);
    }
    const byEncoding = new Map<number, number>();
    let bytes = 0;
    for (const r of frame.rects) {
      bytes += r.data.byteLength;
      byEncoding.set(r.encoding, (byEncoding.get(r.encoding) ?? 0) + r.data.byteLength);
      t.flashes.push({ x: r.x, y: r.y, w: r.w, h: r.h, encoding: r.encoding, at: now });
    }
    t.samples.push({ at: now, bytes, byEncoding, decodeMs });
    t.samples = t.samples.filter((s) => now - s.at <= WINDOW_MS);
    t.flashes = t.flashes.filter((f) => now - f.at <= FLASH_MS);
  }

  summary(toplevel: number, now: number): StreamSummary {
    return summarize(this.byToplevel.get(toplevel)?.samples ?? [], now);
  }

  /** The rectangles that came in the last {@link FLASH_MS}, oldest first. */
  flashes(toplevel: number, now: number): FlashRect[] {
    return (this.byToplevel.get(toplevel)?.flashes ?? []).filter((f) => now - f.at <= FLASH_MS);
  }

  drop(toplevel: number): void {
    this.byToplevel.delete(toplevel);
  }

  clear(): void {
    this.byToplevel.clear();
  }

  /** How many toplevels have anything recorded: none while the switch is off. */
  get size(): number {
    return this.byToplevel.size;
  }
}

export const streamStats = new StreamStats();
