/**
 * What the Terminal knows about its shell, from the marks the image's bash integration prints: OSC 133 for
 * where a prompt, the typing and a command's output start and how the command ended, OSC 7 for the working
 * directory. A shell that prints none (another shell, a remote one) leaves it `unknown`.
 */

export type ShellPhase = "unknown" | "prompt" | "input" | "running";

export type ShellState = {
  phase: ShellPhase;
  /** When the running command started (ms), while `phase` is `running`. */
  startedAt: number | null;
  /** The last finished command's exit code, null before the first. */
  lastExit: number | null;
  /** The working directory, from the last OSC 7. */
  cwd: string | null;
};

export const INITIAL_SHELL_STATE: ShellState = { phase: "unknown", startedAt: null, lastExit: null, cwd: null };

/**
 * The state after one OSC 133 mark (its payload: `A`, `B`, `C`, `D;2`). `D` counts only after `C`: bash
 * says `D` at every prompt but the first, an empty line included, and only a command that ran has an exit.
 * An unknown mark changes nothing.
 */
export function applyMark(state: ShellState, payload: string, now: number): ShellState {
  const [kind, ...rest] = payload.split(";");
  switch (kind) {
    case "A":
      return { ...state, phase: "prompt", startedAt: null };
    case "B":
      return { ...state, phase: "input" };
    case "C":
      return { ...state, phase: "running", startedAt: now };
    case "D": {
      if (state.phase !== "running") return state;
      const code = Number(rest[0]);
      return { ...state, phase: "prompt", startedAt: null, lastExit: Number.isInteger(code) ? code : null };
    }
    default:
      return state;
  }
}

/**
 * The path an OSC 7 payload (`file://host/path`, percent-encoded) names, decoded byte for byte as UTF-8, or
 * null for anything else. The path may hold any character, an escape or a newline among them: it is data,
 * shown as text.
 */
export function cwdFromOsc7(payload: string): string | null {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(payload);
  if (!m?.[1]) return null;
  const chars = [...m[1]];
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const hex = (chars[i + 1] ?? "") + (chars[i + 2] ?? "");
    if (c === "%" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      // An unencoded character keeps its UTF-8 bytes.
      for (const b of encoder.encode(c)) bytes.push(b);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The longest title a window takes from its shell. */
export const MAX_TITLE = 120;

/**
 * A title the shell or a program set (OSC 0 or 2), fit for the window and the taskbar: control characters
 * dropped, at most {@link MAX_TITLE} characters, "Terminal" when nothing is left.
 */
export function windowTitle(title: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is dropped
  const clean = title.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  return clean === "" ? "Terminal" : [...clean].slice(0, MAX_TITLE).join("");
}
