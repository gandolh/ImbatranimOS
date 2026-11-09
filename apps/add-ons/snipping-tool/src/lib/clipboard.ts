/**
 * Writing a capture to the desktop's clipboard as `image/png`.
 *
 * The browser decides whether a write is allowed: it needs a secure context (HTTPS or
 * localhost), and Firefox and Safari also want a recent user action. A delayed or full-screen
 * capture finishes with no action behind it, so a refusal there is expected, not a bug.
 */

const ENCODE_FAILED = 'toBlob returned null'

export type CopyResult = { ok: true } | { ok: false; reason: string }

/** True when this page can write an image to the clipboard at all. */
export function canCopyImages(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.clipboard &&
    typeof window.ClipboardItem !== 'undefined'
  )
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(ENCODE_FAILED))), 'image/png')
  })
}

/** The refusal in plain words, for the toast. */
export function describeCopyFailure(err: unknown): string {
  if (!canCopyImages()) {
    return 'The clipboard only works on a secure page (HTTPS or localhost).'
  }
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'The browser only lets a page copy right after a click or key press, while the page has focus. Use Copy in the editor.'
  }
  if (err instanceof Error && err.message === ENCODE_FAILED) {
    return "The image couldn't be encoded as a PNG (it may be too large)."
  }
  return err instanceof Error && err.message
    ? `The browser refused: ${err.message}`
    : 'The browser refused the copy.'
}

/**
 * Copy a PNG. The blob may still be a promise: the write is issued at once, so a capture can
 * start it while the user's click is still fresh and let the raster finish behind it.
 * Never throws; the result says why a write failed.
 */
export async function copyPng(png: Blob | Promise<Blob>): Promise<CopyResult> {
  // A browser that refuses at once never attaches a handler to the blob promise; do it here
  // so a failed raster is not left as an unhandled rejection.
  void Promise.resolve(png).catch(() => undefined)
  if (!canCopyImages()) {
    return { ok: false, reason: describeCopyFailure(null) }
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: describeCopyFailure(err) }
  }
}
