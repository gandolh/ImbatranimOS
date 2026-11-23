// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ENC_VP8, ENC_WEBP_LOSSLESS, type Frame } from "./frames";
import { FLASH_MS, streamStats, summarize, useStreamStatsSwitch } from "./streamStats";

const frame = (toplevel: number, rects: { encoding: number; bytes: number }[]): Frame => ({
  toplevel,
  width: 640,
  height: 480,
  rects: rects.map((r, i) => ({ x: i * 10, y: 0, w: 10, h: 10, encoding: r.encoding, data: new Uint8Array(r.bytes) })),
});

beforeEach(() => {
  streamStats.clear();
  localStorage.clear();
});

describe("the stream's numbers over the last second", () => {
  it("counts frames a second, kB a second, each encoding's share and the decode time", () => {
    for (let i = 0; i < 24; i++) {
      streamStats.record(
        frame(7, [
          { encoding: ENC_VP8, bytes: 3000 },
          { encoding: ENC_WEBP_LOSSLESS, bytes: 1000 },
        ]),
        4,
        1000 + i * 40,
      );
    }
    const s = streamStats.summary(7, 1000 + 23 * 40);
    expect(s.fps).toBe(24);
    expect(s.kBps).toBeCloseTo(96);
    expect(s.shares).toEqual([
      { encoding: ENC_VP8, share: 0.75 },
      { encoding: ENC_WEBP_LOSSLESS, share: 0.25 },
    ]);
    expect(s.decodeMs).toBe(4);
  });

  it("forgets what is older than a second, and outlines only the last half second", () => {
    streamStats.record(frame(7, [{ encoding: ENC_WEBP_LOSSLESS, bytes: 500 }]), 1, 0);
    streamStats.record(frame(7, [{ encoding: ENC_WEBP_LOSSLESS, bytes: 500 }]), 1, 900);
    expect(streamStats.summary(7, 1500).fps).toBe(1);
    expect(streamStats.flashes(7, 900 + FLASH_MS)).toHaveLength(1);
    expect(streamStats.flashes(7, 900 + FLASH_MS + 1)).toHaveLength(0);
  });

  it("is empty for a window with no frames", () => {
    expect(summarize([], 0)).toEqual({ fps: 0, kBps: 0, shares: [], decodeMs: 0 });
  });
});

describe("the switch", () => {
  it("is off until turned on, kept in localStorage, and turning it off forgets everything", () => {
    expect(useStreamStatsSwitch.getState().on).toBe(false);
    useStreamStatsSwitch.getState().setOn(true);
    expect(localStorage.getItem("imbatranimos:linux-stream-stats")).toBe("on");
    streamStats.record(frame(7, [{ encoding: ENC_VP8, bytes: 10 }]), 1, 0);
    useStreamStatsSwitch.getState().setOn(false);
    expect(streamStats.size).toBe(0);
    expect(localStorage.getItem("imbatranimos:linux-stream-stats")).toBeNull();
  });
});
