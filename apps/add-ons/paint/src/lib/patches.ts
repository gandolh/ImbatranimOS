import type { Rect } from "./geometry";
import type { UndoStack } from "./undoStack";

/** Pixels as `ImageData` holds them: RGBA bytes, row by row. */
export type Pixels = { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray };

/**
 * One undo step: the pixels of `rect` as they were, on a canvas of `canvasWidth` by `canvasHeight`. An edit that
 * changed the canvas's size (a crop) keeps the whole canvas as it was.
 *
 * Paint kept a whole-canvas snapshot per step: a brush stroke on a 4000×3000 photo held 48 MB, and 30 steps grew the
 * tab by 1.4 GB (2026-11-24). A step now holds only the rectangle the edit changed.
 */
export type Patch<P extends Pixels = Pixels> = { rect: Rect; canvasWidth: number; canvasHeight: number; pixels: P };

/** Cuts `rect` out of `pixels` as a new image, made by `make`. */
export type Crop<P extends Pixels> = (pixels: P, rect: Rect) => P;

/** The smallest rectangle where two images of the same size differ, or null when no pixel does. */
export function changedRect(a: Pixels, b: Pixels): Rect | null {
  const w = a.width;
  const h = a.height;
  const x = new Uint32Array(a.data.buffer, a.data.byteOffset, w * h);
  const y = new Uint32Array(b.data.buffer, b.data.byteOffset, w * h);
  const rowDiffers = (row: number) => {
    for (let i = row * w, end = i + w; i < end; i++) if (x[i] !== y[i]) return true;
    return false;
  };
  let top = 0;
  while (top < h && !rowDiffers(top)) top++;
  if (top === h) return null;
  let bottom = h - 1;
  while (bottom > top && !rowDiffers(bottom)) bottom--;
  let left = w;
  let right = -1;
  for (let row = top; row <= bottom; row++) {
    const base = row * w;
    for (let col = 0; col < left; col++) {
      if (x[base + col] !== y[base + col]) {
        left = col;
        break;
      }
    }
    for (let col = w - 1; col > right; col--) {
      if (x[base + col] !== y[base + col]) {
        right = col;
        break;
      }
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** The undo step for an edit that turned `before` into `after`, or null when it changed nothing. */
export function patchFor<P extends Pixels>(before: P, after: P, crop: Crop<P>): Patch<P> | null {
  if (before.width !== after.width || before.height !== after.height) return whole(before);
  const rect = changedRect(before, after);
  if (!rect) return null;
  return { rect, canvasWidth: before.width, canvasHeight: before.height, pixels: crop(before, rect) };
}

/**
 * The step for an edit known to change nothing outside `rect` (a stroke's bounding box): `before`'s pixels there,
 * clipped to the canvas, with no comparison of the whole canvas. Null when the rectangle misses the canvas.
 */
export function patchWithin<P extends Pixels>(before: P, rect: Rect, crop: Crop<P>): Patch<P> | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(before.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(before.height, Math.ceil(rect.y + rect.height));
  if (right <= x || bottom <= y) return null;
  const clipped = { x, y, width: right - x, height: bottom - y };
  return { rect: clipped, canvasWidth: before.width, canvasHeight: before.height, pixels: crop(before, clipped) };
}

/** The whole of `pixels` as a step. */
export function whole<P extends Pixels>(pixels: P): Patch<P> {
  return {
    rect: { x: 0, y: 0, width: pixels.width, height: pixels.height },
    canvasWidth: pixels.width,
    canvasHeight: pixels.height,
    pixels,
  };
}

/**
 * What undoing (or redoing) `step` must keep for the other direction: the same rectangle of the canvas as it is
 * now, read by `read`, or the whole canvas when the step goes back to another size.
 */
export function presentFor<P extends Pixels>(
  step: Patch<P>,
  canvas: { width: number; height: number },
  read: (rect: Rect) => P,
): Patch<P> {
  if (step.canvasWidth !== canvas.width || step.canvasHeight !== canvas.height) {
    return whole(read({ x: 0, y: 0, width: canvas.width, height: canvas.height }));
  }
  return { ...step, pixels: read(step.rect) };
}

/**
 * Drops the oldest steps until all the steps held, undo and redo, take at most `maxBytes`; the newest undo step
 * always stays. A fill over a whole photo is still 48 MB a step.
 */
export function withinBytes<P extends Pixels>(stack: UndoStack<Patch<P>>, maxBytes: number): UndoStack<Patch<P>> {
  const size = (steps: Patch<P>[]) => steps.reduce((n, s) => n + s.pixels.data.length, 0);
  let past = stack.past;
  const future = size(stack.future);
  while (past.length > 1 && size(past) + future > maxBytes) past = past.slice(1);
  return past === stack.past ? stack : { ...stack, past };
}
