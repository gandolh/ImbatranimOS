import { describe, expect, it } from "vitest";
import { verticalTarget, type Cell } from "./gridNav";

// Two rows of three, then a row of one under a heading.
const cells: Cell[] = [
  { top: 20, left: 0 },
  { top: 20, left: 100 },
  { top: 20, left: 200 },
  { top: 120, left: 0 },
  { top: 120, left: 100 },
  { top: 120, left: 200 },
  { top: 260, left: 0 },
];

describe("verticalTarget", () => {
  it("moves to the tile below with the closest left edge", () => {
    expect(verticalTarget(cells, 1, 1)).toBe(4);
  });
  it("moves up", () => {
    expect(verticalTarget(cells, 5, -1)).toBe(2);
  });
  it("crosses into a short last row at its nearest tile", () => {
    expect(verticalTarget(cells, 5, 1)).toBe(6);
  });
  it("stays at the first and last row", () => {
    expect(verticalTarget(cells, 1, -1)).toBe(1);
    expect(verticalTarget(cells, 6, 1)).toBe(6);
  });
  it("stays when nothing is laid out", () => {
    expect(
      verticalTarget(
        [
          { top: 0, left: 0 },
          { top: 0, left: 0 },
        ],
        0,
        1,
      ),
    ).toBe(0);
  });
});
