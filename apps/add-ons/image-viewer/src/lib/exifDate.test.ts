import { describe, expect, it } from "vitest";
import { MAX_RANGE_BYTES } from "../api/readRange";
import { FIRST_READ_BYTES, parseExifDate, parseExifDateString, readExifDate } from "./exifDate";

const DATE = "2024:03:09 14:05:33";

function u16(n: number, little: boolean): number[] {
  return little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff];
}
function u32(n: number, little: boolean): number[] {
  return little
    ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
    : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}
function entry(tag: number, type: number, count: number, value: number[], little: boolean): number[] {
  return [...u16(tag, little), ...u16(type, little), ...u32(count, little), ...value];
}

/** A TIFF block: IFD0 -> Exif IFD -> DateTimeOriginal. `exif` omitted: IFD0 has no Exif pointer. */
function tiff(little: boolean, opts: { date?: string; noExifIfd?: boolean; noDateTag?: boolean } = {}): number[] {
  const date = opts.date ?? DATE;
  const head = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, little), ...u32(8, little)];
  // IFD0 at 8: one entry (a Make-like tag, or the Exif pointer), next-IFD 0.
  const ifd0Len = 2 + 12 + 4;
  const exifAt = 8 + ifd0Len;
  const ifd0 = opts.noExifIfd
    ? [...u16(1, little), ...entry(0x010f, 2, 1, [0, 0, 0, 0], little), ...u32(0, little)]
    : [...u16(1, little), ...entry(0x8769, 4, 1, u32(exifAt, little), little), ...u32(0, little)];
  if (opts.noExifIfd) return [...head, ...ifd0];
  const exifLen = 2 + 12 + 4;
  const dateAt = exifAt + exifLen;
  const tag = opts.noDateTag ? 0x9004 : 0x9003;
  const exif = [...u16(1, little), ...entry(tag, 2, 20, u32(dateAt, little), little), ...u32(0, little)];
  return [...head, ...ifd0, ...exif, ...ascii(date), 0];
}

function app1(payload: number[]): number[] {
  return [0xff, 0xe1, ...u16(payload.length + 2, false), ...payload];
}
function exifSegment(little: boolean, opts?: Parameters<typeof tiff>[1]): number[] {
  return app1([...ascii("Exif"), 0, 0, ...tiff(little, opts)]);
}
function jpeg(...segments: number[][]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2]);
}
const jfif = [0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const xmp = app1([...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii("<x/>")]);

function local(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  return new Date(y, mo - 1, d, h, mi, s);
}

describe("parseExifDate", () => {
  it.each([
    ["little-endian (II)", true],
    ["big-endian (MM)", false],
  ])("reads DateTimeOriginal, %s", (_name, little) => {
    expect(parseExifDate(jpeg(exifSegment(little)))).toEqual({ kind: "date", date: local(2024, 3, 9, 14, 5, 33) });
  });

  it("skips APP0 and a non-Exif APP1 before the Exif block", () => {
    expect(parseExifDate(jpeg(jfif, xmp, exifSegment(true)))).toEqual({
      kind: "date",
      date: local(2024, 3, 9, 14, 5, 33),
    });
  });

  it("is none for a file that is not a JPEG", () => {
    expect(parseExifDate(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toEqual({ kind: "none" });
    expect(parseExifDate(new Uint8Array(0))).toEqual({ kind: "none" });
  });

  it("is none when the only APP1 is not Exif", () => {
    expect(parseExifDate(jpeg(jfif, xmp))).toEqual({ kind: "none" });
  });

  it("is none when IFD0 has no Exif pointer", () => {
    expect(parseExifDate(jpeg(exifSegment(true, { noExifIfd: true })))).toEqual({ kind: "none" });
  });

  it("is none when the Exif IFD has no DateTimeOriginal", () => {
    expect(parseExifDate(jpeg(exifSegment(false, { noDateTag: true })))).toEqual({ kind: "none" });
  });

  it("is none for a blank or zero date", () => {
    expect(parseExifDate(jpeg(exifSegment(true, { date: "0000:00:00 00:00:00" })))).toEqual({ kind: "none" });
    expect(parseExifDate(jpeg(exifSegment(true, { date: "                   " })))).toEqual({ kind: "none" });
  });

  it("asks for the rest of the segment when the buffer is cut inside it", () => {
    const whole = jpeg(exifSegment(true));
    const cut = whole.subarray(0, 30);
    const parsed = parseExifDate(cut);
    expect(parsed.kind).toBe("need-more");
    if (parsed.kind === "need-more") {
      expect(parsed.end).toBeGreaterThan(30);
      expect(parsed.end).toBeLessThanOrEqual(whole.length);
      expect(parseExifDate(whole.subarray(0, parsed.end))).toEqual({
        kind: "date",
        date: local(2024, 3, 9, 14, 5, 33),
      });
    }
  });

  it("gives up when the segment would end past the 64 KB cap", () => {
    // A 65500-byte APP1 that is not Exif, then the Exif one: the Exif block ends past 64 KB.
    const filler = app1(new Array(65500).fill(0));
    const whole = jpeg(filler, exifSegment(true));
    expect(whole.length).toBeGreaterThan(MAX_RANGE_BYTES);
    expect(parseExifDate(whole.subarray(0, 100))).toMatchObject({ kind: "need-more" });
    expect(parseExifDate(whole.subarray(0, MAX_RANGE_BYTES))).toEqual({ kind: "none" });
  });
});

describe("parseExifDateString", () => {
  it("makes a local date", () => {
    expect(parseExifDateString(DATE)).toEqual(local(2024, 3, 9, 14, 5, 33));
  });
  it.each([
    "",
    "0000:00:00 00:00:00",
    "2024:00:09 14:05:33",
    "2024:02:30 10:00:00",
    "2024:03:09 25:00:00",
    "not a date at all",
  ])("is null for %j", (text) => {
    expect(parseExifDateString(text)).toBeNull();
  });
});

describe("readExifDate", () => {
  function fileReader(file: Uint8Array) {
    const calls: Array<[number, number]> = [];
    const read = async (start: number, length: number) => {
      calls.push([start, length]);
      return file.slice(start, start + length);
    };
    return { read, calls };
  }

  it("reads once when the Exif block is in the first 16 KB", async () => {
    const { read, calls } = fileReader(jpeg(exifSegment(true)));
    expect(await readExifDate(read)).toEqual(local(2024, 3, 9, 14, 5, 33));
    expect(calls).toEqual([[0, FIRST_READ_BYTES]]);
  });

  it("reads on when the block lies further, never past 64 KB in all, from where it left off", async () => {
    const file = jpeg(app1(new Array(20000).fill(0)), exifSegment(false));
    const { read, calls } = fileReader(file);
    expect(await readExifDate(read)).toEqual(local(2024, 3, 9, 14, 5, 33));
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls[1]![0]).toBe(FIRST_READ_BYTES);
    expect(calls.reduce((n, [, len]) => n + len, 0)).toBeLessThanOrEqual(MAX_RANGE_BYTES);
  });

  it("is null for a file shorter than the first read that is cut mid-segment", async () => {
    const whole = jpeg(exifSegment(true));
    const { read, calls } = fileReader(whole.subarray(0, 30));
    expect(await readExifDate(read)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("is null when the Exif block would end past 64 KB", async () => {
    const file = jpeg(app1(new Array(65500).fill(0)), exifSegment(true));
    const { read, calls } = fileReader(file);
    expect(await readExifDate(read)).toBeNull();
    expect(calls.reduce((n, [, len]) => n + len, 0)).toBeLessThanOrEqual(MAX_RANGE_BYTES);
  });

  it("is null when the read fails", async () => {
    expect(await readExifDate(() => Promise.reject(new Error("416")))).toBeNull();
  });
});
