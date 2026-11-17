/**
 * A Linux window's frame, as the `/api/wayland` socket carries it: a kind
 * byte (2), then the toplevel, the window's size and its changed rectangles,
 * lossless except a playing video's region. The layout is described once in
 * `apps/wayland-host/PROTOCOL.md`.
 */

export const WS_KIND_FRAME = 2;
export const ENC_DEFLATE_RGBA = 1;
export const ENC_WEBP_LOSSLESS = 2;
/** A large region that changes on most frames (a video), sent lossy. */
export const ENC_JPEG = 3;
/** The same region as one frame of the window's VP8 stream (see `VideoStreams`). */
export const ENC_VP8 = 4;

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

/** The decoder settings a tab checks before it says it decodes VP8. */
const VP8_CONFIG: VideoDecoderConfig = { codec: "vp8", optimizeForLatency: true };

/**
 * The video codecs this tab decodes, as the socket's query names them: VP8
 * where WebCodecs has it, else none, and the host sends a video's region as
 * JPEG.
 */
export async function decodableVideoCodecs(): Promise<string[]> {
  if (typeof VideoDecoder === "undefined") return [];
  try {
    const { supported } = await VideoDecoder.isConfigSupported(VP8_CONFIG);
    return supported ? ["vp8"] : [];
  } catch {
    return [];
  }
}

/** A frame not out of the decoder by then is lost, and the stream with it. */
const DECODE_TIMEOUT_MS = 1000;

/** WebCodecs wants a timestamp per chunk; the frames are drawn as they come. */
const FRAME_US = 33_333;

type Waiter = (frame: VideoFrame | null) => void;

type Stream = {
  decoder: VideoDecoder;
  width: number;
  height: number;
  /** Frames sent to the decoder and not out yet, oldest first. */
  waiting: Waiter[];
  timestamp: number;
};

/** A VP8 frame is a keyframe when bit 0 of its frame tag is clear. */
export function isVp8Keyframe(data: Uint8Array): boolean {
  return data.length > 0 && ((data[0] ?? 1) & 1) === 0;
}

/**
 * Each window's VP8 decoder, for the frames of its video region. A stream
 * starts with a keyframe, and the host sends one whenever the region moves
 * or is resized. A decoder that fails, or that the browser takes back, asks
 * the host for a keyframe through `requestKeyframe` and draws nothing until
 * it comes.
 */
export class VideoStreams {
  private readonly streams = new Map<number, Stream>();
  /** Windows that asked for a keyframe and haven't had one yet. */
  private readonly asked = new Set<number>();

  private readonly requestKeyframe: (toplevel: number) => void;

  constructor(requestKeyframe: (toplevel: number) => void) {
    this.requestKeyframe = requestKeyframe;
  }

  /** Decode one VP8 rectangle of `toplevel`'s frame: its picture, or null. */
  decode(toplevel: number, rect: FrameRect): Promise<VideoFrame | null> {
    const key = isVp8Keyframe(rect.data);
    let s = this.streams.get(toplevel);
    if (key) {
      this.asked.delete(toplevel);
      if (!s || s.decoder.state !== "configured" || s.width !== rect.w || s.height !== rect.h) {
        if (s) this.close(toplevel, s);
        s = this.open(toplevel, rect.w, rect.h);
      }
    }
    if (!s || s.decoder.state !== "configured") {
      // A delta with no picture to apply it to.
      if (!key) this.ask(toplevel);
      return Promise.resolve(null);
    }
    const stream = s;
    return new Promise<VideoFrame | null>((resolve) => {
      const timer = setTimeout(() => this.fail(toplevel), DECODE_TIMEOUT_MS);
      stream.waiting.push((frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
      try {
        stream.timestamp += FRAME_US;
        stream.decoder.decode(
          new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: stream.timestamp, data: rect.data }),
        );
      } catch {
        this.fail(toplevel);
      }
    });
  }

  /** The window is gone: its decoder too. */
  drop(toplevel: number): void {
    const s = this.streams.get(toplevel);
    if (s) this.close(toplevel, s);
    this.asked.delete(toplevel);
  }

  dropAll(): void {
    for (const [toplevel, s] of [...this.streams]) this.close(toplevel, s);
    this.asked.clear();
  }

  private open(toplevel: number, width: number, height: number): Stream | undefined {
    if (typeof VideoDecoder === "undefined") return undefined;
    const waiting: Waiter[] = [];
    const decoder = new VideoDecoder({
      output: (frame) => {
        const waiter = waiting.shift();
        if (waiter) waiter(frame);
        else frame.close();
      },
      error: () => this.fail(toplevel),
    });
    try {
      decoder.configure({ ...VP8_CONFIG, codedWidth: width, codedHeight: height });
    } catch {
      decoder.close();
      return undefined;
    }
    const s: Stream = { decoder, width, height, waiting, timestamp: 0 };
    this.streams.set(toplevel, s);
    return s;
  }

  /** The decoder broke or stalled: drop it and ask for a keyframe. */
  private fail(toplevel: number): void {
    const s = this.streams.get(toplevel);
    if (s) this.close(toplevel, s);
    this.ask(toplevel);
  }

  private close(toplevel: number, s: Stream): void {
    if (this.streams.get(toplevel) === s) this.streams.delete(toplevel);
    for (const waiter of s.waiting.splice(0)) waiter(null);
    if (s.decoder.state !== "closed") s.decoder.close();
  }

  private ask(toplevel: number): void {
    if (this.asked.has(toplevel)) return;
    this.asked.add(toplevel);
    this.requestKeyframe(toplevel);
  }
}

/**
 * Draw a frame onto a window's canvas. The canvas holds the frame's pixels
 * and is laid out at `scale` of them to a CSS pixel: a window an app drew for
 * a scale-2 output keeps its CSS size and shows one image pixel to one device
 * pixel on a screen whose devicePixelRatio is 2. A new size clears it, and the
 * host sends the whole window after a resize.
 */
export async function paintFrame(
  canvas: HTMLCanvasElement,
  frame: Frame,
  scale = 1,
  videos?: VideoStreams,
): Promise<void> {
  const decoded: (ImageData | ImageBitmap | VideoFrame | null)[] = await Promise.all(
    frame.rects.map((rect) =>
      rect.encoding === ENC_VP8 ? (videos?.decode(frame.toplevel, rect) ?? Promise.resolve(null)) : decodeRect(rect),
    ),
  );
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  // Always set, so the CSS size changes with the pixels, never a frame apart.
  const s = scale >= 1 ? scale : 1;
  const cssWidth = `${frame.width / s}px`;
  const cssHeight = `${frame.height / s}px`;
  if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
  if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    for (const image of decoded) if (image && "close" in image) image.close();
    return;
  }
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
