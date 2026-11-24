import { describe, expect, it } from "vitest";
import type { Rect } from "./geometry";
import { changedRect, patchFor, patchWithin, presentFor, withinBytes, whole, type Patch, type Pixels } from "./patches";
import { createUndoStack, push, redo, undo, type UndoStack } from "./undoStack";

const image = (width: number, height: number, fill = 0): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(fill);
  return { width, height, data };
};
const crop = (p: Pixels, r: Rect): Pixels => {
  const out = image(r.width, r.height);
  for (let row = 0; row < r.height; row++) {
    const from = ((r.y + row) * p.width + r.x) * 4;
    out.data.set(p.data.subarray(from, from + r.width * 4), row * r.width * 4);
  }
  return out;
};
const put = (target: Pixels, p: Pixels, x: number, y: number) => {
  for (let row = 0; row < p.height; row++) {
    target.data.set(p.data.subarray(row * p.width * 4, (row + 1) * p.width * 4), ((y + row) * target.width + x) * 4);
  }
};
const paint = (p: Pixels, r: Rect, v: number) => {
  for (let row = r.y; row < r.y + r.height; row++)
    p.data.fill(v, (row * p.width + r.x) * 4, (row * p.width + r.x + r.width) * 4);
};
const same = (a: Pixels, b: Pixels) =>
  a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i]);

/** A canvas and its undo stack, run the way Paint runs them. */
function canvasWithUndo(start: Pixels) {
  let canvas = start;
  let stack: UndoStack<Patch> = createUndoStack(30);
  const copy = (p: Pixels) => ({ width: p.width, height: p.height, data: p.data.slice() });
  return {
    get canvas() {
      return canvas;
    },
    edit(change: (c: Pixels) => Pixels) {
      const before = copy(canvas);
      canvas = change(copy(canvas));
      const step = patchFor(before, canvas, crop);
      if (step) stack = push(stack, step);
    },
    step(direction: "undo" | "redo") {
      const top = direction === "undo" ? stack.past.at(-1) : stack.future.at(-1);
      if (!top) return;
      const present = presentFor(top, canvas, (r) => crop(canvas, r));
      const result = direction === "undo" ? undo(stack, present) : redo(stack, present);
      if (!result) return;
      stack = result.stack;
      const s = result.state;
      if (s.canvasWidth !== canvas.width || s.canvasHeight !== canvas.height)
        canvas = image(s.canvasWidth, s.canvasHeight);
      put(canvas, s.pixels, s.rect.x, s.rect.y);
    },
    get stack() {
      return stack;
    },
  };
}

describe("changedRect", () => {
  it("is null for the same pixels and the bounding box of what differs", () => {
    const a = image(10, 8);
    const b = image(10, 8);
    expect(changedRect(a, b)).toBeNull();
    b.data[(3 * 10 + 4) * 4 + 2] = 9;
    expect(changedRect(a, b)).toEqual({ x: 4, y: 3, width: 1, height: 1 });
    b.data[(6 * 10 + 1) * 4] = 9;
    b.data[(0 * 10 + 9) * 4 + 3] = 9;
    expect(changedRect(a, b)).toEqual({ x: 1, y: 0, width: 9, height: 7 });
  });
});

describe("undo by patches", () => {
  it("brings back every state exactly, through strokes, a whole fill, a crop and redo", () => {
    const c = canvasWithUndo(image(40, 30, 255));
    const states = [c.canvas.data.slice()];
    const sizes: [number, number][] = [[40, 30]];
    const record = () => {
      states.push(c.canvas.data.slice());
      sizes.push([c.canvas.width, c.canvas.height]);
    };
    c.edit((p) => (paint(p, { x: 2, y: 3, width: 10, height: 2 }, 0), p));
    record();
    c.edit((p) => (paint(p, { x: 30, y: 20, width: 5, height: 9 }, 80), p));
    record();
    c.edit((p) => (paint(p, { x: 0, y: 0, width: 40, height: 30 }, 120), p));
    record();
    c.edit((p) => crop(p, { x: 5, y: 5, width: 12, height: 7 }));
    record();
    c.edit((p) => (paint(p, { x: 1, y: 1, width: 3, height: 3 }, 7), p));
    record();
    // An edit that changes nothing is no step.
    c.edit((p) => p);
    expect(c.stack.past).toHaveLength(5);

    for (let i = states.length - 2; i >= 0; i--) {
      c.step("undo");
      expect([c.canvas.width, c.canvas.height]).toEqual(sizes[i]);
      expect(same(c.canvas, { width: c.canvas.width, height: c.canvas.height, data: states[i]! })).toBe(true);
    }
    for (let i = 1; i < states.length; i++) {
      c.step("redo");
      expect(same(c.canvas, { width: sizes[i]![0], height: sizes[i]![1], data: states[i]! })).toBe(true);
    }
  });

  it("keeps a stroke's step to the rectangle it changed", () => {
    const c = canvasWithUndo(image(4000, 300, 255));
    c.edit((p) => (paint(p, { x: 100, y: 10, width: 200, height: 6 }, 0), p));
    const step = c.stack.past[0]!;
    expect(step.rect).toEqual({ x: 100, y: 10, width: 200, height: 6 });
    expect(step.pixels.data.length).toBe(200 * 6 * 4);
  });
});

describe("patchWithin", () => {
  it("keeps a stroke's box as it was, clipped to the canvas, and nothing for a box off it", () => {
    const before = image(20, 10, 5);
    expect(patchWithin(before, { x: -3, y: 8, width: 6, height: 9 }, crop)).toMatchObject({
      rect: { x: 0, y: 8, width: 3, height: 2 },
      canvasWidth: 20,
      canvasHeight: 10,
    });
    expect(patchWithin(before, { x: 25, y: 0, width: 4, height: 4 }, crop)).toBeNull();
  });
});

describe("withinBytes", () => {
  it("drops the oldest steps past the budget and always keeps the newest", () => {
    const step = (n: number) => whole(image(n, 1));
    let stack: UndoStack<Patch> = createUndoStack(30);
    for (const n of [10, 20, 30]) stack = push(stack, step(n));
    expect(withinBytes(stack, 1000).past.map((s) => s.pixels.width)).toEqual([10, 20, 30]);
    expect(withinBytes(stack, 200).past.map((s) => s.pixels.width)).toEqual([20, 30]);
    expect(withinBytes(stack, 10).past.map((s) => s.pixels.width)).toEqual([30]);
  });
});
