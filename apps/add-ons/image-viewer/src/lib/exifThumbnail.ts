/**
 * A photo's own small preview, as its camera stored it in the Exif block (IFD1), with what drawing it needs.
 * It lies inside the Exif segment the date read already holds, so it costs no request.
 */
export type ExifThumbnail = {
  /** The preview's JPEG bytes: a view into the buffer that was read. */
  bytes: Uint8Array;
  width: number;
  height: number;
  /** The photo's Exif orientation, 1 to 8 (1 when absent). The preview is stored the way the photo is. */
  orientation: number;
};

/** The shortest side a preview needs to stand in for its photo in a grid tile (88 px and up). */
export const MIN_THUMBNAIL_SIDE = 120;

/**
 * How far the preview's shape may differ from the photo's. Some cameras pad a 16:9 photo's preview into 4:3 with
 * black bands, which a square crop would show.
 */
const MAX_ASPECT_DIFFERENCE = 0.03;

const TAG_COMPRESSION = 0x0103;
const TAG_ORIENTATION = 0x0112;
const TAG_JPEG_OFFSET = 0x0201;
const TAG_JPEG_LENGTH = 0x0202;
const TAG_EXIF_IFD = 0x8769;
const TAG_PIXEL_X = 0xa002;
const TAG_PIXEL_Y = 0xa003;
const COMPRESSION_JPEG = 6;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;

/**
 * The embedded preview of the JPEG whose first bytes are `bytes`, or null: no Exif block wholly inside them, no
 * JPEG preview in it, one smaller than {@link MIN_THUMBNAIL_SIDE}, one of another shape than the photo (or the
 * photo's size not recorded), or one with Exif of its own (the browser would turn it a second time).
 */
export function findExifThumbnail(bytes: Uint8Array): ExifThumbnail | null {
  for (const segment of exifSegments(bytes)) {
    const found = thumbnailIn(segment.subarray(6));
    if (found) return found;
  }
  return null;
}

/**
 * The CSS transform that stands a preview up the way the browser would stand its photo up (Exif orientation 2 to
 * 8), or undefined for 1 and anything unknown.
 */
export function orientationTransform(orientation: number): string | undefined {
  switch (orientation) {
    case 2:
      return "scaleX(-1)";
    case 3:
      return "rotate(180deg)";
    case 4:
      return "scaleY(-1)";
    case 5:
      return "rotate(270deg) scaleX(-1)";
    case 6:
      return "rotate(90deg)";
    case 7:
      return "rotate(90deg) scaleX(-1)";
    case 8:
      return "rotate(270deg)";
    default:
      return undefined;
  }
}

/** Each Exif APP1 segment wholly inside `bytes`, from its "Exif\0\0" header on, until the image data starts. */
function* exifSegments(bytes: Uint8Array): Generator<Uint8Array> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  let pos = 2;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1] ?? 0;
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return;
    const end = pos + 2 + (((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0));
    if (end > bytes.length || end < pos + 4) return;
    if (marker === 0xe1 && isExifHeader(bytes, pos + 4)) yield bytes.subarray(pos + 4, end);
    pos = end;
  }
}

function isExifHeader(b: Uint8Array, at: number): boolean {
  return (
    b[at] === 0x45 &&
    b[at + 1] === 0x78 &&
    b[at + 2] === 0x69 &&
    b[at + 3] === 0x66 &&
    b[at + 4] === 0 &&
    b[at + 5] === 0
  );
}

type Ifd = { entries: Map<number, { type: number; count: number; valueAt: number }>; next: number };

function thumbnailIn(tiff: Uint8Array): ExifThumbnail | null {
  if (tiff.length < 8) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  let little: boolean;
  if (tiff[0] === 0x49 && tiff[1] === 0x49) little = true;
  else if (tiff[0] === 0x4d && tiff[1] === 0x4d) little = false;
  else return null;
  if (view.getUint16(2, little) !== 42) return null;

  const ifd0 = readIfd(view, view.getUint32(4, little), little);
  if (!ifd0 || ifd0.next === 0) return null;
  const ifd1 = readIfd(view, ifd0.next, little);
  if (!ifd1) return null;
  const compression = numberAt(view, ifd1, TAG_COMPRESSION, little);
  const offset = numberAt(view, ifd1, TAG_JPEG_OFFSET, little);
  const length = numberAt(view, ifd1, TAG_JPEG_LENGTH, little);
  if (compression !== COMPRESSION_JPEG || offset === null || length === null || offset + length > tiff.length) {
    return null;
  }
  const bytes = tiff.subarray(offset, offset + length);
  const size = jpegSize(bytes);
  if (!size || Math.min(size.width, size.height) < MIN_THUMBNAIL_SIDE) return null;
  if (!exifSegments(bytes).next().done) return null;

  const exifAt = numberAt(view, ifd0, TAG_EXIF_IFD, little);
  const exif = exifAt === null ? null : readIfd(view, exifAt, little);
  const photoWidth = exif ? numberAt(view, exif, TAG_PIXEL_X, little) : null;
  const photoHeight = exif ? numberAt(view, exif, TAG_PIXEL_Y, little) : null;
  if (!photoWidth || !photoHeight) return null;
  const photoAspect = photoWidth / photoHeight;
  if (Math.abs(size.width / size.height - photoAspect) / photoAspect > MAX_ASPECT_DIFFERENCE) return null;

  const orientation = numberAt(view, ifd0, TAG_ORIENTATION, little);
  return {
    bytes,
    width: size.width,
    height: size.height,
    orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : 1,
  };
}

function readIfd(view: DataView, offset: number, little: boolean): Ifd | null {
  if (offset < 8 || offset + 2 > view.byteLength) return null;
  const count = view.getUint16(offset, little);
  const end = offset + 2 + count * 12;
  if (end + 4 > view.byteLength) return null;
  const entries: Ifd["entries"] = new Map();
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    entries.set(view.getUint16(at, little), {
      type: view.getUint16(at + 2, little),
      count: view.getUint32(at + 4, little),
      valueAt: at + 8,
    });
  }
  return { entries, next: view.getUint32(end, little) };
}

/** A one-value SHORT or LONG entry's value (held in the entry itself), or null. */
function numberAt(view: DataView, ifd: Ifd, tag: number, little: boolean): number | null {
  const entry = ifd.entries.get(tag);
  if (!entry || entry.count !== 1) return null;
  if (entry.type === TYPE_SHORT) return view.getUint16(entry.valueAt, little);
  if (entry.type === TYPE_LONG) return view.getUint32(entry.valueAt, little);
  return null;
}

/** A JPEG's width and height from its start-of-frame header, or null. */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 <= b.length && b[pos] === 0xff) {
    const marker = b[pos + 1] ?? 0;
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = ((b[pos + 5] ?? 0) << 8) | (b[pos + 6] ?? 0);
      const width = ((b[pos + 7] ?? 0) << 8) | (b[pos + 8] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    pos += 2 + (((b[pos + 2] ?? 0) << 8) | (b[pos + 3] ?? 0));
  }
  return null;
}
