import { describe, expect, it, vi } from "vitest";
import { decodeRect, paintFrame, parseFrame, ENC_JPEG, ENC_WEBP_LOSSLESS } from "./frames";

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
