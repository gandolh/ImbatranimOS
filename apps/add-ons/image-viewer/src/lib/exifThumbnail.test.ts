import { describe, expect, it } from "vitest";
import { findExifThumbnail, orientationTransform } from "./exifThumbnail";

function u16(n: number, little: boolean): number[] {
  return little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff];
}
function u32(n: number, little: boolean): number[] {
  return little
    ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
    : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** One IFD entry whose value fits in the entry: SHORT (3) or LONG (4). */
function entry(tag: number, type: 3 | 4, value: number, little: boolean): number[] {
  const v = type === 3 ? [...u16(value, little), 0, 0] : u32(value, little);
  return [...u16(tag, little), ...u16(type, little), ...u32(1, little), ...v];
}
function ifd(entries: number[][], next: number, little: boolean): number[] {
  return [...u16(entries.length, little), ...entries.flat(), ...u32(next, little)];
}

/** A tiny JPEG preview: SOI, a DQT-like segment, SOF0 with its size, SOS, EOI. */
function preview(width: number, height: number, extra: number[] = []): number[] {
  return [
    0xff,
    0xd8,
    ...extra,
    0xff,
    0xdb,
    0,
    4,
    0,
    0,
    0xff,
    0xc0,
    0,
    11,
    8,
    ...u16(height, false),
    ...u16(width, false),
    1,
    1,
    0x11,
    0,
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ];
}

type Opts = {
  little?: boolean;
  orientation?: number;
  photo?: [number, number] | null;
  thumb?: number[] | null;
  compression?: number;
};

/** "Exif\0\0" and a TIFF block: IFD0 (orientation, Exif pointer) -> Exif IFD (pixel size), IFD1 -> the preview. */
function exifPayload(opts: Opts = {}): number[] {
  const little = opts.little ?? true;
  const head = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, little), ...u32(8, little)];
  const thumb = opts.thumb === undefined ? preview(320, 240) : opts.thumb;
  const photo = opts.photo === undefined ? [4000, 3000] : opts.photo;
  const ifd0Entries = 2;
  const ifd0At = 8;
  const exifAt = ifd0At + 2 + ifd0Entries * 12 + 4;
  const exifEntries = photo ? 2 : 0;
  const ifd1At = exifAt + 2 + exifEntries * 12 + 4;
  const ifd1Entries = 3;
  const thumbAt = ifd1At + 2 + ifd1Entries * 12 + 4;
  const ifd0 = ifd(
    [entry(0x0112, 3, opts.orientation ?? 1, little), entry(0x8769, 4, exifAt, little)],
    thumb ? ifd1At : 0,
    little,
  );
  const exif = ifd(photo ? [entry(0xa002, 4, photo[0], little), entry(0xa003, 4, photo[1], little)] : [], 0, little);
  const ifd1 = thumb
    ? ifd(
        [
          entry(0x0103, 3, opts.compression ?? 6, little),
          entry(0x0201, 4, thumbAt, little),
          entry(0x0202, 4, thumb.length, little),
        ],
        0,
        little,
      )
    : [];
  return [...ascii("Exif"), 0, 0, ...head, ...ifd0, ...exif, ...ifd1, ...(thumb ?? [])];
}
function app1(payload: number[]): number[] {
  return [0xff, 0xe1, ...u16(payload.length + 2, false), ...payload];
}
function jpeg(...segments: number[][]): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0, 2, 1, 2, 3]);
}

describe("findExifThumbnail", () => {
  it.each([
    ["little-endian", true],
    ["big-endian", false],
  ])("finds the preview in IFD1, %s", (_name, little) => {
    const found = findExifThumbnail(jpeg(app1(exifPayload({ little, orientation: 6 }))));
    expect(found).toMatchObject({ width: 320, height: 240, orientation: 6 });
    expect([...(found?.bytes.subarray(0, 2) ?? [])]).toEqual([0xff, 0xd8]);
    expect(found?.bytes.length).toBe(preview(320, 240).length);
  });

  it("skips an XMP APP1 before the Exif block", () => {
    const xmp = app1([...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii("<x/>")]);
    expect(findExifThumbnail(jpeg(xmp, app1(exifPayload())))).toMatchObject({ width: 320, height: 240 });
  });

  it("is null when the Exif block runs past the bytes read", () => {
    const whole = jpeg(app1(exifPayload()));
    expect(findExifThumbnail(whole.subarray(0, whole.length - 40))).toBeNull();
  });

  it("is null without a preview, or with one that is not a JPEG", () => {
    expect(findExifThumbnail(jpeg(app1(exifPayload({ thumb: null }))))).toBeNull();
    expect(findExifThumbnail(jpeg(app1(exifPayload({ compression: 1 }))))).toBeNull();
  });

  it("is null for a preview too small for a tile", () => {
    expect(findExifThumbnail(jpeg(app1(exifPayload({ thumb: preview(160, 119), photo: [1600, 1190] }))))).toBeNull();
  });

  it("is null for a preview of another shape than the photo (a padded 16:9 photo)", () => {
    expect(findExifThumbnail(jpeg(app1(exifPayload({ photo: [4000, 2250] }))))).toBeNull();
  });

  it("is null when the photo's size is not recorded", () => {
    expect(findExifThumbnail(jpeg(app1(exifPayload({ photo: null }))))).toBeNull();
  });

  it("is null for a preview with Exif of its own", () => {
    const inner = app1(exifPayload({ thumb: null }));
    expect(findExifThumbnail(jpeg(app1(exifPayload({ thumb: preview(320, 240, inner) }))))).toBeNull();
  });

  it("reads an unknown orientation as upright", () => {
    expect(findExifThumbnail(jpeg(app1(exifPayload({ orientation: 9 }))))?.orientation).toBe(1);
  });

  it("is null for a file that is not a JPEG", () => {
    expect(findExifThumbnail(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
  });
});

describe("orientationTransform", () => {
  it("stands each Exif orientation up", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 0].map(orientationTransform)).toEqual([
      undefined,
      "scaleX(-1)",
      "rotate(180deg)",
      "scaleY(-1)",
      "rotate(270deg) scaleX(-1)",
      "rotate(90deg)",
      "rotate(90deg) scaleX(-1)",
      "rotate(270deg)",
      undefined,
    ]);
  });
});
