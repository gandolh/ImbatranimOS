/**
 * The one way text is pasted into the Terminal: the keyboard's paste event, the
 * right-click and middle-click paste, and a text drop all come here.
 *
 * The rule is xterm's (the X11 terminal), as Ghostty copies it in
 * `src/input/paste.zig`: text that could run a command the moment it lands asks
 * first, then the control bytes a shell would act on become spaces, then
 * xterm.js's own `paste()` converts newlines and adds the bracket markers when
 * the shell asked for them. A web page can put any text on the clipboard, so a
 * paste is untrusted input.
 */

/** Ends a bracketed paste early: anything after it runs as typed. */
const BRACKET_END = "\x1b[201~";

/**
 * Replaced with a space before a paste, as xterm does: NUL, BS, ENQ, EOT, ESC,
 * DEL, and the tty's control keys (^C, ^\, ^U, ^Z, ^Q, ^S, ^W, ^V, ^R, ^O).
 * Tab, `\n` and `\r` stay: they are what a pasted script is made of.
 */
const STRIPPED = new Set([
  0x00, 0x08, 0x05, 0x04, 0x1b, 0x7f, 0x03, 0x1c, 0x15, 0x1a, 0x11, 0x13, 0x17, 0x16, 0x12, 0x0f,
]);

/** What a paste needs of the terminal: its paste mode, and xterm's own paste. */
export interface PasteTarget {
  readonly modes: { readonly bracketedPasteMode: boolean };
  paste(data: string): void;
}

/**
 * Whether `text` can go in without asking: it never ends a bracketed paste, and
 * when the shell has not asked for bracketed paste it holds no line break, since
 * each one would run what came before it.
 */
export function isSafePaste(text: string, bracketedPaste: boolean): boolean {
  if (text.includes(BRACKET_END)) return false;
  if (!bracketedPaste && (text.includes("\r") || text.includes("\n"))) return false;
  return true;
}

/** `text` with every byte in the strip list turned into a space. */
export function stripPaste(text: string): string {
  let out = "";
  for (const ch of text) out += STRIPPED.has(ch.charCodeAt(0)) ? " " : ch;
  return out;
}

/** Lines shown in the confirmation, before "…". */
const PREVIEW_LINES = 6;

/**
 * The start of `text` for the confirmation, with control bytes drawn visibly:
 * ESC as `^[` (caret notation for the rest), a carriage return as `␍`. Lines
 * stay lines, so the person sees what each one would run.
 */
export function previewPaste(text: string): string {
  const lines = text.split("\n");
  const shown = lines.slice(0, PREVIEW_LINES).map((line) => {
    let out = "";
    for (const ch of line) {
      const code = ch.charCodeAt(0);
      if (ch === "\r") out += "␍";
      else if (ch === "\t") out += ch;
      else if (code < 0x20) out += `^${String.fromCharCode(code + 0x40)}`;
      else if (code === 0x7f) out += "^?";
      else out += ch;
    }
    return out;
  });
  return lines.length > PREVIEW_LINES ? `${shown.join("\n")}\n…` : shown.join("\n");
}

/**
 * Pastes `text` into `term`, asking first through `ask` (given the preview; the
 * Terminal passes the kit's confirm dialog) when it is unsafe. Returns whether
 * anything was pasted.
 */
export async function safePaste(
  term: PasteTarget,
  text: string,
  ask: (preview: string) => Promise<boolean>,
): Promise<boolean> {
  if (text === "") return false;
  if (!isSafePaste(text, term.modes.bracketedPasteMode) && !(await ask(previewPaste(text)))) return false;
  term.paste(stripPaste(text));
  return true;
}
