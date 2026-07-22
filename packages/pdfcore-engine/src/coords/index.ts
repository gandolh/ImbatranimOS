/**
 * Coordinates — THE single shared, unit-tested transform (architecture.md
 * "Coordinates — one shared transform"; the most bug-prone area, carried over
 * from the Studio era). Render, the selection text layer (brief 16), Annotate
 * hit-testing (brief 14) and Forms widget geometry (brief 13) all convert
 * through THIS module and no other. If two consumers disagree, marks mis-land
 * silently — so there is exactly one implementation here.
 *
 * Conventions
 * -----------
 * - **PDF user space**: origin BOTTOM-LEFT, +x right, +y up, units = points.
 *   A page is `{ width, height }` in points. This is what the engine exposes on
 *   every public capability signature (see api/types.ts).
 * - **Screen space**: origin TOP-LEFT, +x right, +y DOWN, units = CSS px of the
 *   rendered canvas. Canvas pixel size = page size × `scale`.
 * - `scale = 1` ⇒ 1 pt = 1 px (pdf.js renders 1 px/pt at scale 1).
 *
 * Page rotation is threaded through {@link ViewTransform.rotation}; at rotation
 * 0 the transforms reduce to a pure y-flip + scale. Rotation-aware mapping is
 * kept minimal in v1 (0 is the common case) and extended by later briefs.
 */

import type { Box, Point, Rect } from "../api/types.js";

/** A page's intrinsic size in PDF points. */
export interface PageSizePt {
  width: number;
  height: number;
}

/**
 * The render context tying a page to its on-screen canvas: the page's point
 * dimensions, the zoom `scale` and the page rotation it is drawn at.
 */
export interface ViewTransform {
  /** Page size in PDF points (unrotated). */
  page: PageSizePt;
  /** Render scale (zoom). 1 = 100% (1 px per pt). Must be > 0. */
  scale: number;
  /** Clockwise page rotation in degrees. Default 0. */
  rotation?: 0 | 90 | 180 | 270;
}

/* ───────────────────────────────────────────── rect ↔ box conversions ──── */

/** `[x1,y1,x2,y2]` rect (PDF space) → `{x,y,w,h}` box (bottom-left origin). */
export function rectToBox(r: Rect): Box {
  const [x1, y1, x2, y2] = r;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** `{x,y,w,h}` box (bottom-left origin) → `[x1,y1,x2,y2]` rect (PDF space). */
export function boxToRect(b: Box): Rect {
  return [b.x, b.y, b.x + b.w, b.y + b.h];
}

/* ───────────────────────────────────────────────────────── points ─────── */

/** Screen point (top-left origin, px) → PDF point (bottom-left origin, pt). */
export function screenToPdfPoint(p: Point, t: ViewTransform): Point {
  return {
    x: p.x / t.scale,
    y: t.page.height - p.y / t.scale,
  };
}

/** PDF point (bottom-left origin, pt) → screen point (top-left origin, px). */
export function pdfToScreenPoint(p: Point, t: ViewTransform): Point {
  return {
    x: p.x * t.scale,
    y: (t.page.height - p.y) * t.scale,
  };
}

/* ───────────────────────────────────────────────────────── boxes ──────── */

/** Screen box (top-left origin, px) → PDF box (bottom-left origin, pt). */
export function screenBoxToPdf(b: Box, t: ViewTransform): Box {
  const w = b.w / t.scale;
  const h = b.h / t.scale;
  const x = b.x / t.scale;
  // Screen y is the box's TOP edge; the PDF bottom-left y is the screen BOTTOM.
  const y = t.page.height - (b.y + b.h) / t.scale;
  return { x, y, w, h };
}

/** PDF box (bottom-left origin, pt) → screen box (top-left origin, px). Inverse of {@link screenBoxToPdf}. */
export function pdfBoxToScreen(b: Box, t: ViewTransform): Box {
  const w = b.w * t.scale;
  const h = b.h * t.scale;
  const x = b.x * t.scale;
  const y = (t.page.height - (b.y + b.h)) * t.scale;
  return { x, y, w, h };
}

/** Screen box → PDF `[x1,y1,x2,y2]` rect. */
export function screenBoxToPdfRect(b: Box, t: ViewTransform): Rect {
  return boxToRect(screenBoxToPdf(b, t));
}

/** PDF `[x1,y1,x2,y2]` rect → screen box. */
export function pdfRectToScreenBox(r: Rect, t: ViewTransform): Box {
  return pdfBoxToScreen(rectToBox(r), t);
}

/* ───────────────────────────────────────────────────── helpers ────────── */

/** Snap a value to the nearest multiple of `grid` (grid <= 0 ⇒ no-op). */
export function snap(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** Normalise a possibly-inverted box (negative w/h) to positive extents. */
export function normalizeBox(b: Box): Box {
  return {
    x: b.w < 0 ? b.x + b.w : b.x,
    y: b.h < 0 ? b.y + b.h : b.y,
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  };
}

/** True if a PDF-space point lies inside a PDF-space rect (hit-testing). */
export function pointInRect(p: Point, r: Rect): boolean {
  const b = rectToBox(r);
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}
