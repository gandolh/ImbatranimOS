/**
 * A Linux window's frame, as the `/api/wayland` socket carries it: a kind
 * byte (2), then the toplevel, the window's size and its changed rectangles,
 * each lossless. The layout is described once in
 * `apps/wayland-host/PROTOCOL.md`.
 */

export const WS_KIND_FRAME = 2;
export const ENC_DEFLATE_RGBA = 1;
export const ENC_WEBP_LOSSLESS = 2;
/** A large region that changes on most frames (a video), sent lossy. */
export const ENC_JPEG = 3;

export type FrameRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  encoding: number;
  data: Uint8Array;
};

export type Frame = {
  toplevel: number;
  width: number;
  height: number;
  rects: FrameRect[];
};

/** Parse a binary message; null for anything that isn't a whole frame. */
export function parseFrame(message: ArrayBuffer): Frame | null {
  const view = new DataView(message);
  if (message.byteLength < 15 || view.getUint8(0) !== WS_KIND_FRAME) return null;
  const toplevel = view.getUint32(1, true);
  const width = view.getUint32(5, true);
  const height = view.getUint32(9, true);
  const count = view.getUint16(13, true);
  const rects: FrameRect[] = [];
  let off = 15;
  for (let i = 0; i < count; i++) {
    if (off + 21 > message.byteLength) return null;
    const x = view.getUint32(off, true);
    const y = view.getUint32(off + 4, true);
    const w = view.getUint32(off + 8, true);
    const h = view.getUint32(off + 12, true);
    const encoding = view.getUint8(off + 16);
    const len = view.getUint32(off + 17, true);
    off += 21;
    if (off + len > message.byteLength) return null;
    rects.push({ x, y, w, h, encoding, data: new Uint8Array(message, off, len) });
    off += len;
  }
  return { toplevel, width, height, rects };
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decode one rectangle into something a 2D canvas can draw. Deflate carries
 * raw RGBA; WebP and JPEG decode off the main thread in `createImageBitmap`.
 */
export async function decodeRect(rect: FrameRect): Promise<ImageData | ImageBitmap | null> {
  if (rect.w === 0 || rect.h === 0) return null;
  if (rect.encoding === ENC_DEFLATE_RGBA) {
    const rgba = await inflate(rect.data);
    if (rgba.length !== rect.w * rect.h * 4) return null;
    return new ImageData(
      new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length),
      rect.w,
      rect.h,
    );
  }
  if (rect.encoding === ENC_WEBP_LOSSLESS || rect.encoding === ENC_JPEG) {
    // Drawn the same way: the host sends a video's region as JPEG while it
    // plays, then lossless WebP once it is still.
    const type = rect.encoding === ENC_JPEG ? "image/jpeg" : "image/webp";
    return createImageBitmap(new Blob([rect.data as BlobPart], { type }));
  }
  return null;
}

/**
 * Draw a frame onto a window's canvas. The canvas holds the frame's pixels
 * and is laid out at `scale` of them to a CSS pixel: a window an app drew for
 * a scale-2 output keeps its CSS size and shows one image pixel to one device
 * pixel on a screen whose devicePixelRatio is 2. A new size clears it, and the
 * host sends the whole window after a resize.
 */
export async function paintFrame(canvas: HTMLCanvasElement, frame: Frame, scale = 1): Promise<void> {
  const decoded = await Promise.all(frame.rects.map(decodeRect));
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  // Always set, so the CSS size changes with the pixels, never a frame apart.
  const s = scale >= 1 ? scale : 1;
  const cssWidth = `${frame.width / s}px`;
  const cssHeight = `${frame.height / s}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  frame.rects.forEach((rect, i) => {
    const image = decoded[i];
    if (!image) return;
    if (image instanceof ImageData) {
      ctx.putImageData(image, rect.x, rect.y);
    } else {
      // Replace, don't blend: a transparent pixel in the app is transparent.
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      ctx.drawImage(image, rect.x, rect.y);
      image.close();
    }
  });
}
