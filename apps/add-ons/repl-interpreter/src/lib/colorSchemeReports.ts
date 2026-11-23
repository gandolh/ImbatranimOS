import type { IDisposable, Terminal as XTerm } from "@xterm/xterm";

/**
 * The dark and light mode detection sequences (Contour's, also in Ghostty, kitty and foot), which xterm.js
 * doesn't speak: a program turns reports on with `CSI ? 2031 h`, asks with `CSI ? 996 n`, and the terminal
 * answers `CSI ? 997 ; 1 n` for dark or `CSI ? 997 ; 2 n` for light, and says it again unasked when the
 * desktop's mode changes while reports are on. Neovim sets its `background` from it.
 */

export type ColorMode = "dark" | "light";

const MODE = 2031;

/** The report for `mode`. */
export function colorSchemeReport(mode: ColorMode): string {
  return `\x1b[?997;${mode === "dark" ? 1 : 2}n`;
}

/** Whether a CSI's parameters name `mode` (sub-parameters, given as arrays, are not a mode). */
function names(params: (number | number[])[], mode: number): boolean {
  return params.some((p) => p === mode);
}

export type ColorSchemeReports = {
  /** The desktop's mode changed: say so once, if reports are on. */
  modeChanged(): void;
  /** Whether the program turned reports on. */
  readonly enabled: boolean;
  dispose(): void;
};

/**
 * Answers the sequences on `term`, sending replies with `send` (to the pty, as typing) and reading the
 * desktop's mode from `mode`. Every other mode in the same sequence stays xterm's: the set and reset handlers
 * note 2031 and let xterm go on. A full reset (RIS) turns reports off, as it does xterm's own modes.
 */
export function colorSchemeReports(
  term: Pick<XTerm, "parser">,
  mode: () => ColorMode,
  send: (data: string) => void,
): ColorSchemeReports {
  let enabled = false;
  const handlers: IDisposable[] = [
    term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
      if (names(params, MODE)) enabled = true;
      return false;
    }),
    term.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
      if (names(params, MODE)) enabled = false;
      return false;
    }),
    // The query: `CSI ? 996 n`.
    term.parser.registerCsiHandler({ prefix: "?", final: "n" }, (params) => {
      if (params.length !== 1 || params[0] !== 996) return false;
      send(colorSchemeReport(mode()));
      return true;
    }),
    // DECRQM for 2031, so a program can tell the terminal knows it: 1 set, 2 reset.
    term.parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, (params) => {
      if (params.length !== 1 || params[0] !== MODE) return false;
      send(`\x1b[?${MODE};${enabled ? 1 : 2}$y`);
      return true;
    }),
    term.parser.registerEscHandler({ final: "c" }, () => {
      enabled = false;
      return false;
    }),
  ];
  return {
    modeChanged() {
      if (enabled) send(colorSchemeReport(mode()));
    },
    get enabled() {
      return enabled;
    },
    dispose() {
      for (const h of handlers) h.dispose();
    },
  };
}
