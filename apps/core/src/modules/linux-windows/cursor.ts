/**
 * The cursor over the session's Linux windows, as a CSS `cursor` value. The
 * host sends a CSS name (cursor-shape-v1), or the image an app drew itself
 * (every X11 app, GTK 3 apps) as a PNG with its hotspot. The window bodies
 * and popups carry the value, so it shows only over them; smithay sets the
 * default arrow when the pointer leaves an app, and the host sends that too.
 */

/** A cursor an app drew itself, as the host sends it. */
export type LinuxCursorImage = {
  /** A PNG, straight alpha, in base64. */
  png: string;
  /** Its size in image pixels. */
  width: number;
  height: number;
  /** Image pixels per CSS pixel: the scale the app drew it at. */
  scale: number;
  /** The hotspot in CSS pixels from the image's top-left. */
  hotspot_x: number;
  hotspot_y: number;
};

/** The host sends no cursor larger than this, in image pixels each way. */
const MAX_SIZE = 128;
/** The most PNG a 128x128 RGBA image can take, in base64, with room. */
const MAX_PNG_BASE64 = 256 * 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** CSS cursor names are lower-case words joined by hyphens. */
const NAME = /^[a-z]+(-[a-z]+)*$/;

/** Whether the browser takes this `cursor` value. */
export type CursorSupport = (value: string) => boolean;

const browserSupport: CursorSupport = (value) =>
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("cursor", value);

/** The image-set function the browser takes in `cursor`, probed once. */
let probed: { fn: string | null } | null = null;

function imageSetFunction(supports: CursorSupport): string | null {
  if (supports !== browserSupport) return findImageSet(supports);
  probed ??= { fn: findImageSet(supports) };
  return probed.fn;
}

function findImageSet(supports: CursorSupport): string | null {
  for (const fn of ["image-set", "-webkit-image-set"]) {
    if (supports(`${fn}(url("data:image/png;base64,AA==") 2x) 1 1, default`)) return fn;
  }
  return null;
}

function isIntIn(v: unknown, min: number, max: number): v is number {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
}

function validImage(image: unknown): LinuxCursorImage | null {
  if (typeof image !== "object" || image === null) return null;
  const i = image as Record<string, unknown>;
  if (typeof i.png !== "string" || i.png.length > MAX_PNG_BASE64 || !BASE64.test(i.png)) return null;
  if (!isIntIn(i.width, 1, MAX_SIZE) || !isIntIn(i.height, 1, MAX_SIZE)) return null;
  if (!isIntIn(i.scale, 1, 4)) return null;
  const scale = i.scale;
  if (!isIntIn(i.hotspot_x, 0, Math.ceil(i.width / scale) - 1)) return null;
  if (!isIntIn(i.hotspot_y, 0, Math.ceil(i.height / scale) - 1)) return null;
  return image as LinuxCursorImage;
}

/**
 * The CSS `cursor` for the host's `cursor` message: the app's image when it
 * sent a valid one, sized in CSS pixels (an image drawn at scale 2 shows at
 * half its pixels, through `image-set`), else the name, else `default`. A
 * browser without `image-set` in `cursor` shows a scale-2 image at its full
 * pixel size, its hotspot scaled to match.
 */
export function cursorCss(name: unknown, image?: unknown, supports: CursorSupport = browserSupport): string {
  const fallback = typeof name === "string" && NAME.test(name) ? name : "default";
  const img = validImage(image);
  if (!img) return fallback;
  const url = `url("data:image/png;base64,${img.png}")`;
  if (img.scale > 1) {
    const fn = imageSetFunction(supports);
    if (fn) return `${fn}(${url} ${img.scale}x) ${img.hotspot_x} ${img.hotspot_y}, default`;
    return `${url} ${img.hotspot_x * img.scale} ${img.hotspot_y * img.scale}, default`;
  }
  return `${url} ${img.hotspot_x} ${img.hotspot_y}, default`;
}
