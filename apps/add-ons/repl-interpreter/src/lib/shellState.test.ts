import { describe, expect, it } from "vitest";
import { applyMark, cwdFromOsc7, INITIAL_SHELL_STATE, MAX_TITLE, windowTitle, type ShellState } from "./shellState";

/**
 * Recorded from Alpine's bash 5.3 with the image's integration, under a pty (home renamed): a prompt,
 * `(exit 2)`, `false`, an empty line, a cd into a directory named with a newline, an ESC, a fake OSC 2
 * and a BEL, then `exit`.
 */
const RECORDED =
  "\u001b]133;A\u0007\u001b]7;file://vm/home/imbatranim\u0007\u001b]2;~\u0007\u001b[?2004h# \u001b]133;B\u0007(exit 2)\r\n\u001b[?2004l\r\u001b]133;C\u0007\u001b]133;D;2\u0007\u001b]133;A\u0007\u001b]7;file://vm/home/imbatranim\u0007\u001b]2;~\u0007\u001b[?2004h# \u001b]133;B\u0007false\r\n\u001b[?2004l\r\u001b]133;C\u0007\u001b]133;D;1\u0007\u001b]133;A\u0007\u001b]7;file://vm/home/imbatranim\u0007\u001b]2;~\u0007\u001b[?2004h# \u001b]133;B\u0007\r\n\u001b[?2004l\r\u001b]133;D;1\u0007\u001b]133;A\u0007\u001b]7;file://vm/home/imbatranim\u0007\u001b]2;~\u0007\u001b[?2004h# \u001b]133;B\u0007cd \"$(printf 'a\\nb\\033]2;pwned\\007\\303\\251')\"\r\n\u001b[?2004l\r\u001b]133;C\u0007\u001b]133;D;0\u0007\u001b]133;A\u0007\u001b]7;file://vm/home/imbatranim/a%0Ab%1B%5D2%3Bpwned%07%C3%A9\u0007\u001b]2;~/a?b?]2;pwned?é\u0007\u001b[?2004h# \u001b]133;B\u0007exit\r\n\u001b[?2004l\r\u001b]133;C\u0007exit\r\n";

/** Every OSC in the stream, in order: its number and its payload. */
function oscs(stream: string): { code: number; payload: string }[] {
  // eslint-disable-next-line no-control-regex -- the sequences are made of control characters
  return [...stream.matchAll(/\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g)].map((m) => ({
    code: Number(m[1]),
    payload: m[2] ?? "",
  }));
}

/** The state after each 133 or 7 in the stream, with a clock that ticks once per mark. */
function replay(stream: string): ShellState[] {
  let state = INITIAL_SHELL_STATE;
  let now = 0;
  const seen: ShellState[] = [];
  for (const { code, payload } of oscs(stream)) {
    now += 1;
    if (code === 133) state = applyMark(state, payload, now);
    else if (code === 7) state = { ...state, cwd: cwdFromOsc7(payload) ?? state.cwd };
    else continue;
    seen.push(state);
  }
  return seen;
}

describe("the shell state, from a recorded bash session", () => {
  const states = replay(RECORDED);

  it("follows prompt, typing and running", () => {
    expect(states.map((s) => s.phase).slice(0, 5)).toEqual(["prompt", "prompt", "input", "running", "prompt"]);
  });

  it("takes each finished command's exit code, and an empty line changes none", () => {
    const exits = states.filter((s, i) => s.lastExit !== (states[i - 1]?.lastExit ?? null)).map((s) => s.lastExit);
    expect(exits).toEqual([2, 1, 0]);
  });

  it("keeps when the running command started", () => {
    const running = states.find((s) => s.phase === "running");
    expect(running?.startedAt).toEqual(expect.any(Number));
    expect(states.at(-1)?.phase).toBe("running");
  });

  it("decodes a hostile directory to its real name, as text", () => {
    const cwds = [...new Set(states.map((s) => s.cwd))];
    expect(cwds).toEqual([null, "/home/imbatranim", "/home/imbatranim/a\nb\x1b]2;pwned\x07é"]);
  });

  it("never lets the directory's name start a sequence of its own", () => {
    // Only the integration's own OSCs: 133, 7 and 2, and no OSC 2 that reads "pwned".
    expect(new Set(oscs(RECORDED).map((o) => o.code))).toEqual(new Set([133, 7, 2]));
    expect(
      oscs(RECORDED)
        .filter((o) => o.code === 2)
        .map((o) => o.payload),
    ).toEqual(["~", "~", "~", "~", "~/a?b?]2;pwned?é"]);
  });
});

describe("applyMark", () => {
  it("counts D only after C", () => {
    const prompt = applyMark(INITIAL_SHELL_STATE, "A", 1);
    expect(applyMark(prompt, "D;5", 2)).toBe(prompt);
  });

  it("ignores a mark it doesn't know", () => {
    expect(applyMark(INITIAL_SHELL_STATE, "P;k=i", 1)).toBe(INITIAL_SHELL_STATE);
  });

  it("keeps no exit code it can't read", () => {
    const running = applyMark(INITIAL_SHELL_STATE, "C", 1);
    expect(applyMark(running, "D", 2).lastExit).toBeNull();
  });
});

describe("cwdFromOsc7", () => {
  it("refuses anything but a file URL with a path", () => {
    expect(cwdFromOsc7("http://vm/tmp")).toBeNull();
    expect(cwdFromOsc7("file://vm")).toBeNull();
  });

  it("decodes invalid UTF-8 to replacement characters rather than throwing", () => {
    expect(cwdFromOsc7("file://vm/a%FFb")).toBe("/a�b");
  });
});

describe("windowTitle", () => {
  it("drops control characters and falls back to Terminal", () => {
    expect(windowTitle("vim\x1b]2;x\x07 notes")).toBe("vim]2;x notes");
    expect(windowTitle("\x07\x1b")).toBe("Terminal");
  });

  it("keeps at most the longest title", () => {
    expect([...windowTitle("é".repeat(300))]).toHaveLength(MAX_TITLE);
  });
});
