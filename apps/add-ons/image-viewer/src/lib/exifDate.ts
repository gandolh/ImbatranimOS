import { MAX_RANGE_BYTES } from "../api/readRange";
import { findExifThumbnail, type ExifThumbnail } from "./exifThumbnail";

/** What the first `bytes.length` bytes of a file say about its capture date. */
export type ExifParse =
  | { kind: "date"; date: Date }
  | { kind: "none" }
  /** The Exif data runs past the buffer: `end` is how many bytes from the file's start are needed. */
  | { kind: "need-more"; end: number };

const NONE: ExifParse = { kind: "none" };

/** Bytes asked for first; most phones put the Exif block well inside it. */
export const FIRST_READ_BYTES = 16 * 1024;

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TYPE_ASCII = 2;

/**
 * Parses an Exif `DateTimeOriginal` out of the start of a JPEG.
 *
 * Returns `need-more` (with the byte count to have) when the APP1 segment or
 * the data it points at lies beyond the buffer, and `none` for anything that
 * is not a JPEG with a usable date. The date is local wall-clock time, as
 * Exif stores it (no zone).
 */
export function parseExifDate(bytes: Uint8Array): ExifParse {
  if (bytes.length < 2) return bytes.length === 0 ? NONE : { kind: "need-more", end: 2 };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return NONE; // not a JPEG

  let pos = 2;
  for (;;) {
    // Skip fill bytes, find the next marker.
    if (pos + 4 > bytes.length) return needOrNone(pos + 4);
    if (bytes[pos] !== 0xff) return NONE;
    let marker = bytes[pos + 1] ?? 0;
    while (marker === 0xff) {
      pos += 1;
      if (pos + 4 > bytes.length) return needOrNone(pos + 4);
      marker = bytes[pos + 1] ?? 0;
    }
    // Standalone markers carry no length; start of scan / end of image end the headers.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return NONE;
    const segLen = ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0);
    if (segLen < 2) return NONE;
    const segEnd = pos + 2 + segLen;
    if (marker === 0xe1) {
      // Another app's APP1 (XMP, say) can be skipped unread, however long it is.
      if (pos + 10 <= bytes.length && !hasExifHeader(bytes, pos + 4)) {
        pos = segEnd;
        continue;
      }
      // Wait for the whole segment so every offset inside it can be read.
      if (segEnd > bytes.length) return needOrNone(segEnd);
      const found = readApp1(bytes.subarray(pos + 4, segEnd));
      if (found) return { kind: "date", date: found };
      // An APP1 that is not Exif, or Exif without a date: keep looking (XMP
      // often precedes or follows). A second Exif block is rare but legal.
    }
    pos = segEnd;
  }
}

/** `need-more` while the limit allows it, `none` once the file would need more than the cap. */
function needOrNone(end: number): ExifParse {
  return end > MAX_RANGE_BYTES ? NONE : { kind: "need-more", end };
}

function hasExifHeader(b: Uint8Array, at: number): boolean {
  return (
    b[at] === 0x45 &&
    b[at + 1] === 0x78 &&
    b[at + 2] === 0x69 &&
    b[at + 3] === 0x66 &&
    b[at + 4] === 0 &&
    b[at + 5] === 0
  );
}

function readApp1(seg: Uint8Array): Date | null {
  // "Exif\0\0" then the TIFF block.
  if (seg.length < 14 || !hasExifHeader(seg, 0)) return null;
  const tiff = seg.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  let little: boolean;
  if (tiff[0] === 0x49 && tiff[1] === 0x49) little = true;
  else if (tiff[0] === 0x4d && tiff[1] === 0x4d) little = false;
  else return null;
  if (view.getUint16(2, little) !== 42) return null;

  const ifd0 = view.getUint32(4, little);
  const exifIfd = findTag(view, ifd0, TAG_EXIF_IFD, little);
  if (!exifIfd) return null;
  const date = findTag(view, view.getUint32(exifIfd.valueAt, little), TAG_DATE_TIME_ORIGINAL, little);
  if (!date || date.type !== TYPE_ASCII || date.count < 19) return null;
  // ASCII of 20 bytes sits out of line, at the offset the entry holds.
  const at = view.getUint32(date.valueAt, little);
  if (at + 19 > tiff.length) return null;
  let text = "";
  for (let i = 0; i < 19; i++) text += String.fromCharCode(tiff[at + i] ?? 0);
  return parseExifDateString(text);
}

type Entry = { type: number; count: number; valueAt: number };

/** The entry for `tag` in the IFD at `offset`, or null (bad offset, missing tag). */
function findTag(view: DataView, offset: number, tag: number, little: boolean): Entry | null {
  if (offset < 8 || offset + 2 > view.byteLength) return null;
  const n = view.getUint16(offset, little);
  for (let i = 0; i < n; i++) {
    const at = offset + 2 + i * 12;
    if (at + 12 > view.byteLength) return null;
    if (view.getUint16(at, little) === tag) {
      return { type: view.getUint16(at + 2, little), count: view.getUint32(at + 4, little), valueAt: at + 8 };
    }
  }
  return null;
}

/**
 * `YYYY:MM:DD HH:MM:SS` to a local Date. Blanks, zeros, out-of-range fields
 * and impossible days (Feb 30) are null.
 */
export function parseExifDateString(text: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y === 0 || mo === 0 || d === 0) return null;
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    date.getHours() !== h ||
    date.getMinutes() !== mi ||
    date.getSeconds() !== s
  ) {
    return null;
  }
  return date;
}

/** Reads `length` bytes of the file from `start`; the shape {@link readRange} has once bound to a file. */
export type ReadWindow = (start: number, length: number) => Promise<Uint8Array>;

/** What a photo's first bytes say: its capture date and its embedded preview, each null when it has none. */
export type ExifRead = { date: Date | null; thumbnail: ExifThumbnail | null };

const NOTHING_READ: ExifRead = { date: null, thumbnail: null };

/**
 * A photo's capture date and embedded preview. Reads the first {@link FIRST_READ_BYTES}, then, only while the Exif
 * block lies further, more: each read reaches the byte count the parse asked for, or twice the bytes held,
 * whichever is further, and never past {@link MAX_RANGE_BYTES} in all (so at most three requests). The preview
 * lies inside the Exif block, so it needs no read of its own. A read that fails gives neither, so one unreadable
 * photo falls back to its modified time and its file.
 */
export async function readExif(read: ReadWindow): Promise<ExifRead> {
  try {
    let bytes = await read(0, FIRST_READ_BYTES);
    let parsed = parseExifDate(bytes);
    while (parsed.kind === "need-more" && bytes.length >= FIRST_READ_BYTES && bytes.length < MAX_RANGE_BYTES) {
      const target = Math.min(MAX_RANGE_BYTES, Math.max(parsed.end, bytes.length * 2));
      const more = await read(bytes.length, target - bytes.length);
      if (more.length === 0) return NOTHING_READ;
      const joined = new Uint8Array(bytes.length + more.length);
      joined.set(bytes, 0);
      joined.set(more, bytes.length);
      bytes = joined;
      parsed = parseExifDate(bytes);
    }
    return { date: parsed.kind === "date" ? parsed.date : null, thumbnail: findExifThumbnail(bytes) };
  } catch {
    return NOTHING_READ;
  }
}

/** A photo's capture date, or null: {@link readExif}'s date. */
export async function readExifDate(read: ReadWindow): Promise<Date | null> {
  return (await readExif(read)).date;
}
