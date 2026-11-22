/**
 * A click in the command being typed moves the cursor there, as in a text field (Ghostty 1.3's click to
 * move): the Terminal sends one Left or Right arrow per character between the cursor and the click. On a
 * phone this is the only way to reach a typo without deleting back to it.
 */

/** One cell of the terminal's buffer: its text (empty for a cell nothing was written to) and its width (2 for
 * a wide character, 0 for the cell a wide character's right half covers). */
export type Cell = { chars: string; width: number };

/** A cell's place, its row counted from the row the command starts on. */
export type CellPos = { row: number; col: number };

export type CommandLine = {
  /** The command's rows: the one typing starts on (the shell's B mark) and those wrapped from it. */
  rows: readonly (readonly Cell[])[];
  /** Where typing starts on the first row. */
  startCol: number;
  cursor: CellPos;
};

/** Characters typed before `pos`: a wide character counts once, and a click past the end lands on the end. */
function charsBefore(line: CommandLine, pos: CellPos): number {
  // The right half of a wide character is that character.
  const at = line.rows[pos.row]?.[pos.col];
  const col = at?.width === 0 && pos.col > 0 ? pos.col - 1 : pos.col;
  let count = 0;
  for (let r = 0; r < line.rows.length; r++) {
    const row = line.rows[r] ?? [];
    for (let c = r === 0 ? line.startCol : 0; c < row.length; c++) {
      if (r > pos.row || (r === pos.row && c >= col)) return count;
      const cell = row[c];
      if (cell && cell.width > 0 && cell.chars !== "") count += 1;
    }
  }
  return count;
}

/**
 * How many characters the cursor moves for a click on `click`: negative to the left, positive to the right.
 * Null for a click outside the command: on another row, or on the prompt before typing starts.
 */
export function arrowsTo(line: CommandLine, click: CellPos): number | null {
  if (click.row < 0 || click.row >= line.rows.length) return null;
  if (click.row === 0 && click.col < line.startCol) return null;
  return charsBefore(line, click) - charsBefore(line, line.cursor);
}

/** `n` arrow presses, in the cursor-key mode the program set: `ESC [ D` normally, `ESC O D` in application mode. */
export function arrowKeys(n: number, applicationCursor: boolean): string {
  const key = (applicationCursor ? "\x1bO" : "\x1b[") + (n < 0 ? "D" : "C");
  return key.repeat(Math.abs(n));
}
