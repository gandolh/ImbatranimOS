import { describe, expect, it } from "vitest";
import { cursorCss, type LinuxCursorImage } from "./cursor";

const PNG = "iVBORw0KGgoAAAANSUhEUg==";

function image(patch: Partial<LinuxCursorImage> = {}): LinuxCursorImage {
  return { png: PNG, width: 24, height: 24, scale: 1, hotspot_x: 3, hotspot_y: 11, ...patch };
}

const noImageSet = () => false;
const imageSet = (v: string) => v.startsWith("image-set(");
const webkitOnly = (v: string) => v.startsWith("-webkit-image-set(");

describe("cursorCss", () => {
  it("passes a named cursor through", () => {
    expect(cursorCss("text")).toBe("text");
    expect(cursorCss("ns-resize")).toBe("ns-resize");
    expect(cursorCss("none")).toBe("none");
  });

  it("shows an app-drawn cursor as its PNG at its hotspot, the arrow behind it", () => {
    expect(cursorCss("default", image(), noImageSet)).toBe(`url("data:image/png;base64,${PNG}") 3 11, default`);
  });

  it("sizes a scale 2 cursor in CSS pixels through image-set", () => {
    const hidpi = image({ width: 48, height: 48, scale: 2, hotspot_x: 4, hotspot_y: 20 });
    expect(cursorCss("default", hidpi, imageSet)).toBe(
      `image-set(url("data:image/png;base64,${PNG}") 2x) 4 20, default`,
    );
    expect(cursorCss("default", hidpi, webkitOnly)).toBe(
      `-webkit-image-set(url("data:image/png;base64,${PNG}") 2x) 4 20, default`,
    );
    // Without image-set: the image at its pixel size, the hotspot scaled.
    expect(cursorCss("default", hidpi, noImageSet)).toBe(`url("data:image/png;base64,${PNG}") 8 40, default`);
  });

  it("falls back to the name when the image is not one the host sends", () => {
    const bad: unknown[] = [
      null,
      "url(x)",
      image({ png: 'abc") 0 0, url("https://example.com/x.png' }),
      image({ png: "" }),
      image({ width: 129 }),
      image({ height: 0 }),
      image({ scale: 0 }),
      image({ scale: 1.5 }),
      image({ hotspot_x: 24 }),
      image({ hotspot_y: -1 }),
      image({ width: 48, height: 48, scale: 2, hotspot_x: 24 }),
    ];
    for (const b of bad) expect(cursorCss("default", b, imageSet)).toBe("default");
  });

  it("treats an unknown name as the default arrow", () => {
    expect(cursorCss(undefined)).toBe("default");
    expect(cursorCss("url(x)")).toBe("default");
    expect(cursorCss("pointer; color: red")).toBe("default");
  });
});
