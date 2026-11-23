import { describe, expect, it } from "vitest";
import { isSafePaste, previewPaste, safePaste, stripPaste, type PasteTarget } from "./paste";

describe("isSafePaste", () => {
  // Ghostty's `isSafe` cases (src/input/paste.zig), with and without bracketed paste.
  it("passes plain text either way", () => {
    expect(isSafePaste("hello", false)).toBe(true);
    expect(isSafePaste("hello", true)).toBe(true);
  });

  it("flags a line break when the shell has not asked for bracketed paste", () => {
    expect(isSafePaste("hello\r", false)).toBe(false);
    expect(isSafePaste("hello\r\nworld", false)).toBe(false);
    expect(isSafePaste("hello\nworld", false)).toBe(false);
  });

  it("lets a line break through inside a bracketed paste, which the shell holds until Enter", () => {
    expect(isSafePaste("hello\r\nworld", true)).toBe(true);
  });

  it("flags the bracket's end marker either way: it would end the bracket and run the rest", () => {
    expect(isSafePaste("he\x1b[201~llo", true)).toBe(false);
    expect(isSafePaste("he\x1b[201~llo", false)).toBe(false);
  });
});

describe("stripPaste", () => {
  it("turns every control byte on xterm's list into a space", () => {
    const listed = [0x00, 0x08, 0x05, 0x04, 0x1b, 0x7f, 0x03, 0x1c, 0x15, 0x1a, 0x11, 0x13, 0x17, 0x16, 0x12, 0x0f];
    for (const code of listed) expect(stripPaste(`a${String.fromCharCode(code)}b`)).toBe("a b");
  });

  it("keeps tab, newline and carriage return, and the rest of the text", () => {
    expect(stripPaste("a\tb\nc\rd")).toBe("a\tb\nc\rd");
    expect(stripPaste("ls -la ~/Desktop ăîșț")).toBe("ls -la ~/Desktop ăîșț");
  });

  it("defuses an embedded bracket end", () => {
    expect(stripPaste("he\x1b[201~llo")).toBe("he [201~llo");
  });
});

describe("previewPaste", () => {
  it("draws ESC as ^[ and a carriage return as ␍, keeping lines as lines", () => {
    expect(previewPaste("echo one\r\necho \x1b[201~two\x03")).toBe("echo one␍\necho ^[[201~two^C");
  });

  it("shows the first six lines, then an ellipsis", () => {
    const text = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
    expect(previewPaste(text)).toBe("1\n2\n3\n4\n5\n6\n…");
  });
});

describe("safePaste", () => {
  function target(bracketedPasteMode: boolean): PasteTarget & { pasted: string[] } {
    const pasted: string[] = [];
    return { modes: { bracketedPasteMode }, paste: (d) => pasted.push(d), pasted };
  }

  it("pastes plain text without asking", async () => {
    const t = target(false);
    let asked = 0;
    expect(await safePaste(t, "ls -la", () => Promise.resolve(++asked > 0))).toBe(true);
    expect(asked).toBe(0);
    expect(t.pasted).toEqual(["ls -la"]);
  });

  it("asks before a multi-line paste, and pastes nothing on Cancel", async () => {
    const t = target(false);
    const previews: string[] = [];
    const ok = await safePaste(t, "echo one\necho two", (p) => {
      previews.push(p);
      return Promise.resolve(false);
    });
    expect(ok).toBe(false);
    expect(previews).toEqual(["echo one\necho two"]);
    expect(t.pasted).toEqual([]);
  });

  it("pastes the stripped text through xterm's paste after Paste", async () => {
    const t = target(true);
    expect(await safePaste(t, "x\x1b[201~rm -rf ~\n", () => Promise.resolve(true))).toBe(true);
    expect(t.pasted).toEqual(["x [201~rm -rf ~\n"]);
  });

  it("strips control bytes in a paste that needed no question", async () => {
    const t = target(false);
    await safePaste(t, "a\x03b", () => Promise.resolve(false));
    expect(t.pasted).toEqual(["a b"]);
  });

  it("does nothing with empty text", async () => {
    const t = target(false);
    expect(await safePaste(t, "", () => Promise.resolve(true))).toBe(false);
    expect(t.pasted).toEqual([]);
  });
});
