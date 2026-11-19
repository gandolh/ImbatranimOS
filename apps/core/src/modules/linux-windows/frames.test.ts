import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodableVideoCodecs,
  decodeRect,
  paintFrame,
  parseFrame,
  VideoStreams,
  ENC_JPEG,
  ENC_VP8,
  ENC_WEBP_LOSSLESS,
} from "./frames";

/** A frame as the socket carries it: kind 2, then the body PROTOCOL.md lays out. */
function frameBytes(rects: { x: number; y: number; w: number; h: number; data: number[] }[]) {
  const size = 15 + rects.reduce((n, r) => n + 21 + r.data.length, 0);
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint8(0, 2);
  v.setUint32(1, 9, true);
  v.setUint32(5, 640, true);
  v.setUint32(9, 480, true);
  v.setUint16(13, rects.length, true);
  let off = 15;
  for (const r of rects) {
    [r.x, r.y, r.w, r.h].forEach((n, i) => v.setUint32(off + i * 4, n, true));
    v.setUint8(off + 16, ENC_WEBP_LOSSLESS);
    v.setUint32(off + 17, r.data.length, true);
    new Uint8Array(buf, off + 21, r.data.length).set(r.data);
    off += 21 + r.data.length;
  }
  return buf;
}

describe("parseFrame", () => {
  it("reads the toplevel, the size and each rectangle", () => {
    const f = parseFrame(
      frameBytes([
        { x: 1, y: 2, w: 3, h: 4, data: [7, 8] },
        { x: 5, y: 6, w: 7, h: 8, data: [] },
      ]),
    );
    expect(f).not.toBeNull();
    expect(f!.toplevel).toBe(9);
    expect([f!.width, f!.height]).toEqual([640, 480]);
    expect(f!.rects.map((r) => [r.x, r.y, r.w, r.h, r.encoding, [...r.data]])).toEqual([
      [1, 2, 3, 4, ENC_WEBP_LOSSLESS, [7, 8]],
      [5, 6, 7, 8, ENC_WEBP_LOSSLESS, []],
    ]);
  });

  it("refuses a truncated frame or another kind", () => {
    const whole = frameBytes([{ x: 0, y: 0, w: 1, h: 1, data: [1, 2, 3] }]);
    expect(parseFrame(whole.slice(0, whole.byteLength - 1))).toBeNull();
    const other = whole.slice(0);
    new DataView(other).setUint8(0, 1);
    expect(parseFrame(other)).toBeNull();
  });

  it("decodes a lossy JPEG region the way it decodes WebP", async () => {
    const seen: string[] = [];
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
      seen.push(blob.type);
      return { width: 1, height: 1 };
    });
    const rect = (encoding: number) => ({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      encoding,
      data: new Uint8Array([1]),
    });
    expect(await decodeRect(rect(ENC_JPEG))).not.toBeNull();
    expect(await decodeRect(rect(ENC_WEBP_LOSSLESS))).not.toBeNull();
    expect(await decodeRect(rect(9))).toBeNull();
    expect(seen).toEqual(["image/jpeg", "image/webp"]);
    vi.unstubAllGlobals();
  });
});

describe("paintFrame", () => {
  /** What paintFrame touches of a canvas; no 2D context, so nothing is drawn. */
  const fakeCanvas = () =>
    ({
      width: 0,
      height: 0,
      style: { width: "", height: "" },
      getContext: () => null,
    }) as unknown as HTMLCanvasElement;

  it("lays a scale-2 frame out at half its pixels, the same CSS size as at scale 1", async () => {
    const sharp = fakeCanvas();
    await paintFrame(sharp, { toplevel: 1, width: 1280, height: 960, rects: [] }, 2);
    expect([sharp.width, sharp.height]).toEqual([1280, 960]);
    expect([sharp.style.width, sharp.style.height]).toEqual(["640px", "480px"]);

    const soft = fakeCanvas();
    await paintFrame(soft, { toplevel: 1, width: 640, height: 480, rects: [] }, 1);
    expect([soft.width, soft.height]).toEqual([640, 480]);
    expect([soft.style.width, soft.style.height]).toEqual(["640px", "480px"]);
  });

  it("reads a missing or broken scale as 1", async () => {
    const c = fakeCanvas();
    await paintFrame(c, { toplevel: 1, width: 300, height: 200, rects: [] }, 0);
    expect([c.style.width, c.style.height]).toEqual(["300px", "200px"]);
  });
});

/**
 * WebCodecs' VideoDecoder as far as VideoStreams uses it: each chunk comes out
 * as a frame, unless `mode` breaks it the ways a real one breaks.
 */
class FakeDecoder {
  static made: FakeDecoder[] = [];
  static supported = true;
  static mode: "works" | "errors" | "throws" | "stalls" | "refuses" = "works";
  static isConfigSupported = vi.fn(async () => ({ supported: FakeDecoder.supported }));
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  config: { codedWidth?: number; codedHeight?: number } = {};
  chunks: { type: string }[] = [];
  readonly init: { output: (frame: unknown) => void; error: (e: unknown) => void };
  constructor(init: { output: (frame: unknown) => void; error: (e: unknown) => void }) {
    this.init = init;
    FakeDecoder.made.push(this);
  }
  configure(config: { codedWidth?: number; codedHeight?: number }) {
    if (FakeDecoder.mode === "refuses") throw new Error("NotSupportedError");
    this.config = config;
    this.state = "configured";
  }
  decode(chunk: { type: string }) {
    this.chunks.push(chunk);
    const mode = FakeDecoder.mode;
    if (mode === "throws") throw new Error("EncodingError");
    if (mode === "stalls") return;
    queueMicrotask(() => {
      if (mode === "works") {
        this.init.output({ chunk, close: vi.fn() });
        return;
      }
      // A decoder that fails closes itself, then says why.
      this.state = "closed";
      this.init.error(new Error("EncodingError"));
    });
  }
  close() {
    this.state = "closed";
  }
}

/** A VP8 rectangle: a keyframe's frame tag has bit 0 clear. */
const vp8 = (key: boolean, w = 640, h = 360) => ({
  x: 10,
  y: 20,
  w,
  h,
  encoding: ENC_VP8,
  data: new Uint8Array([key ? 0x10 : 0x11, 0, 0]),
});

describe("VP8 video regions", () => {
  beforeEach(() => {
    FakeDecoder.made = [];
    FakeDecoder.supported = true;
    FakeDecoder.mode = "works";
    vi.stubGlobal("VideoDecoder", FakeDecoder);
    vi.stubGlobal(
      "EncodedVideoChunk",
      class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("says VP8 only where WebCodecs decodes it", async () => {
    expect(await decodableVideoCodecs()).toEqual(["vp8"]);
    FakeDecoder.supported = false;
    expect(await decodableVideoCodecs()).toEqual([]);
    FakeDecoder.isConfigSupported.mockRejectedValueOnce(new Error("no"));
    expect(await decodableVideoCodecs()).toEqual([]);
    vi.stubGlobal("VideoDecoder", undefined);
    expect(await decodableVideoCodecs()).toEqual([]);
  });

  it("decodes a stream from its keyframe, then its deltas", async () => {
    const ask = vi.fn();
    const videos = new VideoStreams(ask, vi.fn());
    expect(await videos.decode(1, vp8(true))).not.toBeNull();
    expect(await videos.decode(1, vp8(false))).not.toBeNull();
    expect(FakeDecoder.made).toHaveLength(1);
    expect(FakeDecoder.made[0]?.config).toMatchObject({ codec: "vp8", codedWidth: 640, codedHeight: 360 });
    expect(FakeDecoder.made[0]?.chunks.map((c) => c.type)).toEqual(["key", "delta"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("tells the decoder the host's colours: BT.601's matrix, limited range, sRGB otherwise", async () => {
    const colorSpace = { primaries: "bt709", transfer: "iec61966-2-1", matrix: "smpte170m", fullRange: false };
    await decodableVideoCodecs();
    expect(FakeDecoder.isConfigSupported).toHaveBeenLastCalledWith(expect.objectContaining({ colorSpace }));
    await new VideoStreams(vi.fn(), vi.fn()).decode(1, vp8(true));
    expect(FakeDecoder.made[0]?.config).toMatchObject({ codec: "vp8", colorSpace });
  });

  it("asks once for a keyframe when a delta has nothing to apply to", async () => {
    const ask = vi.fn();
    const videos = new VideoStreams(ask, vi.fn());
    expect(await videos.decode(3, vp8(false))).toBeNull();
    expect(await videos.decode(3, vp8(false))).toBeNull();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(3);
    // The keyframe comes: decoding goes on, and a later loss asks again.
    expect(await videos.decode(3, vp8(true))).not.toBeNull();
    FakeDecoder.made[0]?.init.error(new Error("reclaimed"));
    expect(await videos.decode(3, vp8(false))).toBeNull();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("starts a new decoder for a keyframe of another size, and closes the old one", async () => {
    const videos = new VideoStreams(vi.fn(), vi.fn());
    await videos.decode(1, vp8(true));
    await videos.decode(1, vp8(true, 800, 450));
    expect(FakeDecoder.made.map((d) => d.state)).toEqual(["closed", "configured"]);
    expect(FakeDecoder.made[1]?.config).toMatchObject({ codedWidth: 800, codedHeight: 450 });
    videos.drop(1);
    expect(FakeDecoder.made[1]?.state).toBe("closed");
  });

  it("draws the decoded picture where its rectangle is, then lets it go", async () => {
    // Node has no ImageData; paintFrame tells pictures from raw pixels by it.
    vi.stubGlobal("ImageData", class {});
    const drawn: unknown[][] = [];
    const ctx = {
      clearRect: vi.fn(),
      drawImage: (...a: unknown[]) => drawn.push(a),
      putImageData: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "" },
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const videos = new VideoStreams(vi.fn(), vi.fn());
    await paintFrame(canvas, { toplevel: 2, width: 1280, height: 720, rects: [vp8(true)] }, 1, videos);
    expect(drawn).toHaveLength(1);
    const [picture, x, y] = drawn[0] ?? [];
    expect([x, y]).toEqual([10, 20]);
    expect((picture as { close: () => void }).close).toHaveBeenCalled();
    // A tab without a decoder for it draws nothing there.
    await paintFrame(canvas, { toplevel: 2, width: 1280, height: 720, rects: [vp8(false)] });
    expect(drawn).toHaveLength(1);
  });

  describe("when the decoders keep failing", () => {
    it.each(["errors", "throws", "refuses"] as const)(
      "gives VP8 up at the third failure when the decoder %s",
      async (mode) => {
        FakeDecoder.mode = mode;
        const ask = vi.fn();
        const fallBack = vi.fn();
        const videos = new VideoStreams(ask, fallBack);
        // Two failures: each asks for a keyframe, and the tab tries again.
        expect(await videos.decode(1, vp8(true))).toBeNull();
        expect(await videos.decode(1, vp8(true))).toBeNull();
        expect(ask).toHaveBeenCalledTimes(2);
        expect(fallBack).not.toHaveBeenCalled();
        // The third: no keyframe asked, VP8 given up, once.
        expect(await videos.decode(1, vp8(true))).toBeNull();
        expect(ask).toHaveBeenCalledTimes(2);
        expect(fallBack).toHaveBeenCalledTimes(1);
        // From then on nothing is decoded, opened or asked for, in any window.
        const made = FakeDecoder.made.length;
        expect(await videos.decode(1, vp8(true))).toBeNull();
        expect(await videos.decode(2, vp8(false))).toBeNull();
        expect(FakeDecoder.made).toHaveLength(made);
        expect(ask).toHaveBeenCalledTimes(2);
        expect(fallBack).toHaveBeenCalledTimes(1);
      },
    );

    it("gives a stalled decoder up after three timeouts, even on a slow link", async () => {
      vi.useFakeTimers();
      FakeDecoder.mode = "stalls";
      const ask = vi.fn();
      const fallBack = vi.fn();
      const videos = new VideoStreams(ask, fallBack);
      for (let i = 0; i < 3; i++) {
        const picture = videos.decode(1, vp8(true));
        await vi.advanceTimersByTimeAsync(1000);
        expect(await picture).toBeNull();
        // The keyframe it asked for takes two seconds to come.
        await vi.advanceTimersByTimeAsync(2000);
      }
      expect(ask).toHaveBeenCalledTimes(2);
      expect(fallBack).toHaveBeenCalledTimes(1);
    });

    it("counts the failures of all the tab's windows together", async () => {
      FakeDecoder.mode = "errors";
      const fallBack = vi.fn();
      const videos = new VideoStreams(vi.fn(), fallBack);
      for (const toplevel of [1, 2, 3]) await videos.decode(toplevel, vp8(true));
      expect(fallBack).toHaveBeenCalledTimes(1);
    });

    it("keeps VP8 through failures spread out, as a browser taking decoders back makes", async () => {
      vi.useFakeTimers();
      FakeDecoder.mode = "errors";
      const ask = vi.fn();
      const fallBack = vi.fn();
      const videos = new VideoStreams(ask, fallBack);
      for (let i = 0; i < 5; i++) {
        expect(await videos.decode(1, vp8(true))).toBeNull();
        await vi.advanceTimersByTimeAsync(6000);
      }
      expect(ask).toHaveBeenCalledTimes(5);
      expect(fallBack).not.toHaveBeenCalled();
      // A decoder that works again draws again.
      FakeDecoder.mode = "works";
      expect(await videos.decode(1, vp8(true))).not.toBeNull();
    });
  });
});
