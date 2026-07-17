/**
 * Lazy bridge to the DOM rasterizer. `html-to-image` is heavy (canvas
 * serialization, font embedding) and must never land in the desktop boot
 * bundle — it is pulled in on first capture via dynamic import, so the whole
 * library becomes its own chunk. Nothing here is imported at module top level.
 */

export type Rect = { x: number; y: number; width: number; height: number }

/**
 * Rasterize the live desktop (`document.body`) into a canvas at the device
 * pixel ratio, then crop to `rect` (given in CSS pixels). The `filter`
 * predicate hides the tool's own overlay + taskbar entry from the shot.
 */
export async function captureRegion(
  rect: Rect,
  filter: (node: HTMLElement) => boolean
): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image')
  const ratio = window.devicePixelRatio || 1

  const full = await toCanvas(document.body, {
    filter: filter as (node: HTMLElement) => boolean,
    pixelRatio: ratio,
    // Paint the desktop surface behind any transparent regions so the PNG is
    // never see-through where a window doesn't cover.
    backgroundColor:
      getComputedStyle(document.documentElement).getPropertyValue('--k-surface').trim() ||
      '#1b1b1f',
  })

  const sx = Math.round(rect.x * ratio)
  const sy = Math.round(rect.y * ratio)
  const sw = Math.max(1, Math.round(rect.width * ratio))
  const sh = Math.max(1, Math.round(rect.height * ratio))

  const cropped = document.createElement('canvas')
  cropped.width = sw
  cropped.height = sh
  const ctx = cropped.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh)
  return cropped
}
