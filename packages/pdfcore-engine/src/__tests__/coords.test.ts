import { describe, it, expect } from "vitest";
import {
  rectToBox,
  boxToRect,
  screenToPdfPoint,
  pdfToScreenPoint,
  screenBoxToPdf,
  pdfBoxToScreen,
  pointInRect,
  type ViewTransform,
} from "../coords/index.js";

const t: ViewTransform = { page: { width: 612, height: 792 }, scale: 2 };

describe("coords — the one shared transform", () => {
  it("rect ↔ box round-trips", () => {
    const box = rectToBox([72, 680, 372, 698]);
    expect(box).toEqual({ x: 72, y: 680, w: 300, h: 18 });
    expect(boxToRect(box)).toEqual([72, 680, 372, 698]);
  });

  it("point screen ↔ pdf round-trips (y-flip + scale)", () => {
    const pdf = { x: 100, y: 700 };
    const screen = pdfToScreenPoint(pdf, t);
    // scale 2, page height 792: y = (792-700)*2 = 184
    expect(screen).toEqual({ x: 200, y: 184 });
    expect(screenToPdfPoint(screen, t)).toEqual(pdf);
  });

  it("box screen ↔ pdf round-trips", () => {
    const pdfBox = { x: 72, y: 680, w: 300, h: 18 };
    const screen = pdfBoxToScreen(pdfBox, t);
    expect(screenBoxToPdf(screen, t)).toEqual(pdfBox);
  });

  it("pointInRect hit-tests in PDF space", () => {
    expect(pointInRect({ x: 100, y: 690 }, [72, 680, 372, 698])).toBe(true);
    expect(pointInRect({ x: 400, y: 690 }, [72, 680, 372, 698])).toBe(false);
  });
});
