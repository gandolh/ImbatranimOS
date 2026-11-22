import { describe, expect, it } from "vitest";
import { arrowKeys, arrowsTo, type Cell, type CommandLine } from "./promptCursor";

/** A row of `cols` cells from text; "界" and other wide characters take two cells, the second of width 0. */
function row(text: string, cols = 10): Cell[] {
  const cells: Cell[] = [];
  for (const ch of text) {
    const wide = /\p{Script=Han}/u.test(ch);
    cells.push({ chars: ch, width: wide ? 2 : 1 });
    if (wide) cells.push({ chars: "", width: 0 });
  }
  while (cells.length < cols) cells.push({ chars: "", width: 1 });
  return cells;
}

describe("arrowsTo", () => {
  // "$ " is the prompt; typing starts at column 2.
  const typed: CommandLine = { rows: [row("$ echo hi")], startCol: 2, cursor: { row: 0, col: 9 } };

  it("moves left to a click in the command, one per character", () => {
    expect(arrowsTo(typed, { row: 0, col: 4 })).toBe(-5);
  });

  it("moves right from a cursor earlier in the line, and stops at the end past the text", () => {
    const early = { ...typed, cursor: { row: 0, col: 2 } };
    expect(arrowsTo(early, { row: 0, col: 9 })).toBe(7);
    expect(arrowsTo(early, { row: 0, col: 9 + 1 })).toBe(7);
  });

  it("ignores a click before typing starts, and one on another row", () => {
    expect(arrowsTo(typed, { row: 0, col: 1 })).toBeNull();
    expect(arrowsTo(typed, { row: 1, col: 0 })).toBeNull();
    expect(arrowsTo(typed, { row: -1, col: 4 })).toBeNull();
  });

  it("counts across a wrapped line", () => {
    // "$ " then 12 characters on 10 columns: 8 on the first row, 4 on the second.
    const wrapped: CommandLine = {
      rows: [row("$ abcdefgh"), row("ijkl")],
      startCol: 2,
      cursor: { row: 1, col: 4 },
    };
    expect(arrowsTo(wrapped, { row: 0, col: 3 })).toBe(-11);
    expect(arrowsTo(wrapped, { row: 1, col: 1 })).toBe(-3);
  });

  it("counts a wide character once, whichever half is clicked", () => {
    // "a界b": the CJK character takes columns 3 and 4.
    const cjk: CommandLine = { rows: [row("$ a界b")], startCol: 2, cursor: { row: 0, col: 6 } };
    expect(arrowsTo(cjk, { row: 0, col: 3 })).toBe(-2);
    expect(arrowsTo(cjk, { row: 0, col: 4 })).toBe(-2);
    expect(arrowsTo(cjk, { row: 0, col: 5 })).toBe(-1);
  });
});

describe("arrowKeys", () => {
  it("sends the normal cursor keys, or the application ones when the program set that mode", () => {
    expect(arrowKeys(-2, false)).toBe("\x1b[D\x1b[D");
    expect(arrowKeys(3, true)).toBe("\x1bOC\x1bOC\x1bOC");
    expect(arrowKeys(0, false)).toBe("");
  });
});
