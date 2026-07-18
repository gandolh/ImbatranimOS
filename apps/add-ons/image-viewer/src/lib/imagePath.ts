/** Extensions this viewer opens — kept in sync with `openWith.ts`'s registration. */
export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif',
  'ico',
] as const

/** True when `name`'s extension is one of {@link IMAGE_EXTENSIONS} (case-insensitive). */
export function isImagePath(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/** Parent directory of a root-relative path (`''` for a top-level file). */
export function parentDir(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

/** Clamp `n` into `[min, max]`. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
