// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinuxTextInput } from "./linuxWindowsStore";
import { byteToIndex, diffText, fieldShape, inputModeFor, SETTLE_MS, TextInputBridge, utf8Length } from "./textInput";

const field = (over: Partial<LinuxTextInput> = {}): LinuxTextInput => ({
  toplevel: 5,
  enabled: true,
  purpose: "normal",
  hints: [],
  text: "",
  cursor: 0,
  anchor: 0,
  rect: null,
  cause: "input_method",
  ...over,
});

/** A hidden input and its bridge, with the app's field mirrored in. */
function setup(app: Partial<LinuxTextInput> = {}) {
  const el = document.createElement("input");
  document.body.appendChild(el);
  const sent: object[] = [];
  const bridge = new TextInputBridge(
    () => el,
    (m) => sent.push(m),
    5,
  );
  bridge.setApp(field(app));
  return { el, sent, bridge };
}

/** What the browser does to the input before it fires `input`. */
function browser(el: HTMLInputElement, value: string, caret: number) {
  el.value = value;
  el.setSelectionRange(caret, caret);
}

const key = (keycode: number) => [
  { type: "key", keycode, pressed: true },
  { type: "key", keycode, pressed: false },
];

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the keyboard a Linux app's field asks for", () => {
  it("maps each purpose to an inputmode", () => {
    const modes = Object.fromEntries(
      ["normal", "email", "url", "phone", "digits", "pin", "number", "terminal", "date", "password"].map((p) => [
        p,
        inputModeFor(p),
      ]),
    );
    expect(modes).toEqual({
      normal: "text",
      email: "email",
      url: "url",
      phone: "tel",
      digits: "numeric",
      pin: "numeric",
      number: "decimal",
      terminal: "text",
      date: "text",
      password: null,
    });
    expect(inputModeFor("something-new")).toBe("text");
  });

  it("turns suggestions off for secrets and terminals, and keeps them elsewhere", () => {
    expect(fieldShape("password", [])).toMatchObject({
      secret: true,
      suggestions: false,
      inputMode: null,
    });
    expect(fieldShape("pin", [])).toMatchObject({
      secret: true,
      suggestions: false,
      inputMode: "numeric",
    });
    expect(fieldShape("normal", ["sensitive_data"])).toMatchObject({
      secret: true,
      suggestions: false,
    });
    expect(fieldShape("normal", ["hidden_text"])).toMatchObject({ secret: true });
    expect(fieldShape("terminal", [])).toMatchObject({
      secret: false,
      suggestions: false,
      autocapitalize: "none",
    });
    expect(fieldShape("email", ["completion"])).toEqual({
      multiline: false,
      secret: false,
      inputMode: "email",
      autocapitalize: null,
      suggestions: true,
    });
  });

  it("takes a textarea for multiline fields and capitalizes as the hints say", () => {
    expect(fieldShape("normal", ["multiline", "auto_capitalization"])).toMatchObject({
      multiline: true,
      autocapitalize: "sentences",
    });
    expect(fieldShape("name", ["titlecase"]).autocapitalize).toBe("words");
    expect(fieldShape("normal", ["uppercase"]).autocapitalize).toBe("characters");
    expect(fieldShape("normal", ["lowercase", "uppercase"]).autocapitalize).toBe("none");
  });
});

describe("offsets between UTF-8 bytes and string indices", () => {
  it("counts ș as two bytes and an emoji as four, in two string units", () => {
    const text = "aș😀b";
    expect(utf8Length(text)).toBe(8);
    expect(byteToIndex(text, 3)).toBe(2);
    expect(byteToIndex(text, 7)).toBe(4);
    // Inside a character: pulled back to its start. Past the end: the end.
    expect(byteToIndex(text, 5)).toBe(2);
    expect(byteToIndex(text, 99)).toBe(5);
  });

  it("never splits a character when it finds what changed", () => {
    const c = diffText({ text: "x😀", start: 3, end: 3 }, "x😁");
    expect(c).toMatchObject({ at: 1, before: "😀", commit: "😁" });
    expect(diffText({ text: "same", start: 4, end: 4 }, "same")).toBeNull();
  });
});

describe("what the keyboard does to the hidden input, as edits for the app", () => {
  it("mirrors the app's text and selection into the input", () => {
    // Byte offsets: "aș|b" with the cursor after ș (3 bytes), anchor at 1.
    const { el } = setup({ text: "așb", cursor: 3, anchor: 1 });
    expect(el.value).toBe("așb");
    expect([el.selectionStart, el.selectionEnd]).toEqual([1, 2]);
  });

  it("sends text inserted at the cursor as a commit", () => {
    const { el, sent, bridge } = setup({ text: "Hi", cursor: 2, anchor: 2 });
    browser(el, "Hi there", 8);
    bridge.input("insertText", " there");
    expect(sent).toEqual([{ type: "text_edit", toplevel: 5, commit: " there" }]);
  });

  it("sends a word being composed as a preedit, then commits it", () => {
    const { el, sent, bridge } = setup();
    bridge.compositionStart();
    bridge.compositionUpdate("ș");
    browser(el, "ș", 1);
    bridge.input("insertCompositionText", "ș");
    bridge.compositionUpdate("șt");
    browser(el, "șt", 2);
    bridge.input("insertCompositionText", "șt");
    bridge.compositionEnd();
    expect(sent).toEqual([
      { type: "text_edit", toplevel: 5, preedit: { text: "ș", cursor_begin: 2, cursor_end: 2 } },
      { type: "text_edit", toplevel: 5, preedit: { text: "șt", cursor_begin: 3, cursor_end: 3 } },
      // The commit's `done` clears the preedit.
      { type: "text_edit", toplevel: 5, commit: "șt" },
    ]);
  });

  it("commits the corrected word when autocorrect changes it as it ends", () => {
    const { el, sent, bridge } = setup({ text: "I ", cursor: 2, anchor: 2 });
    bridge.compositionStart();
    bridge.compositionUpdate("helo");
    browser(el, "I helo", 6);
    bridge.input("insertCompositionText", "helo");
    // The keyboard commits "hello " in the composition's place.
    browser(el, "I hello ", 8);
    bridge.compositionEnd();
    expect(sent.at(-1)).toEqual({ type: "text_edit", toplevel: 5, commit: "hello " });
  });

  it("takes a committed word back out of the text when the keyboard composes it again", () => {
    // Backspacing into a word: the keyboard makes it its composition again,
    // without changing the input's text.
    const { el, sent, bridge } = setup({ text: "hi word", cursor: 7, anchor: 7 });
    bridge.compositionStart();
    bridge.compositionUpdate("word");
    expect(el.value).toBe("hi word");
    bridge.input("insertCompositionText", "word");
    expect(sent).toEqual([
      {
        type: "text_edit",
        toplevel: 5,
        delete: { before: 4, after: 0 },
        preedit: { text: "word", cursor_begin: 4, cursor_end: 4 },
      },
    ]);
  });

  it("replaces an earlier word with a delete and a commit", () => {
    const { el, sent, bridge } = setup({ text: "teh ", cursor: 4, anchor: 4 });
    browser(el, "the ", 4);
    bridge.input("insertReplacementText", "the");
    expect(sent).toEqual([{ type: "text_edit", toplevel: 5, delete: { before: 3, after: 0 }, commit: "he " }]);
  });

  it("deletes by bytes, and types over a selection", () => {
    const a = setup({ text: "aș", cursor: 3, anchor: 3 });
    browser(a.el, "a", 1);
    a.bridge.input("deleteContentBackward", null);
    expect(a.sent).toEqual([{ type: "text_edit", toplevel: 5, delete: { before: 2, after: 0 } }]);

    const b = setup({ text: "abc", cursor: 1, anchor: 3 });
    browser(b.el, "aX", 2);
    b.bridge.input("insertText", "X");
    expect(b.sent).toEqual([{ type: "text_edit", toplevel: 5, commit: "X" }]);
  });

  it("sends a selection deleted with nothing in its place as the app's Backspace", () => {
    const { el, sent, bridge } = setup({ text: "abc", cursor: 3, anchor: 1 });
    browser(el, "a", 1);
    bridge.input("deleteContentBackward", null);
    expect(sent).toEqual(key(14));
  });

  it("clears a preedit the keyboard dropped with a bare edit", () => {
    const { el, sent, bridge } = setup();
    bridge.compositionStart();
    bridge.compositionUpdate("x");
    browser(el, "x", 1);
    bridge.input("insertCompositionText", "x");
    browser(el, "", 0);
    bridge.compositionEnd();
    expect(sent.at(-1)).toEqual({ type: "text_edit", toplevel: 5 });
  });

  it("sends Enter, Tab, Escape and the arrows as keys, and Backspace with nothing to delete", () => {
    const { el, bridge } = setup({ text: "ab", cursor: 2, anchor: 2 });
    expect(["Enter", "Tab", "Escape", "ArrowLeft", "ArrowDown"].map((k) => bridge.softKey(k))).toEqual([
      28, 15, 1, 105, 108,
    ]);
    // Text before the caret: the input deletes it, and the edit follows.
    expect(bridge.softKey("Backspace")).toBeUndefined();
    expect(bridge.softKey("Delete")).toBe(111);
    el.setSelectionRange(0, 0);
    expect(bridge.softKey("Backspace")).toBe(14);
    expect(bridge.softKey("a")).toBeUndefined();
  });

  it("makes a line break Enter, and drops the input's own undo", () => {
    const { bridge } = setup();
    expect(bridge.beforeInput("insertLineBreak")).toBe(28);
    expect(bridge.beforeInput("insertParagraph")).toBe(28);
    expect(bridge.beforeInput("historyUndo")).toBe("drop");
    expect(bridge.beforeInput("insertText")).toBeNull();
    expect(bridge.beforeInput("insertCompositionText")).toBeNull();
  });

  it("makes a delete with nothing in the input to delete a key", () => {
    const empty = setup();
    expect(empty.bridge.beforeInput("deleteContentBackward")).toBe(14);
    expect(empty.bridge.beforeInput("deleteContentForward")).toBe(111);
    // With text there, the input deletes and the edit follows.
    const { el, bridge } = setup({ text: "ab", cursor: 1, anchor: 1 });
    expect(el.selectionStart).toBe(1);
    expect(bridge.beforeInput("deleteContentBackward")).toBeNull();
    expect(bridge.beforeInput("deleteContentForward")).toBeNull();
  });

  it("keeps an app that doesn't say its text on an empty input", () => {
    const { el, sent, bridge } = setup({ text: null });
    browser(el, "ls", 2);
    bridge.input("insertText", "ls");
    expect(sent).toEqual([{ type: "text_edit", toplevel: 5, commit: "ls" }]);
    expect(el.value).toBe("");
    expect(bridge.softKey("Backspace")).toBe(14);
  });
});

describe("the app's text, mirrored back", () => {
  it("waits while a word is composed", () => {
    const { el, bridge } = setup({ text: "ab", cursor: 2, anchor: 2 });
    bridge.compositionStart();
    bridge.setApp(field({ text: "xyz", cursor: 3, anchor: 3 }));
    expect(el.value).toBe("ab");
    bridge.compositionEnd();
    expect(el.value).toBe("xyz");
  });

  it("holds a different text back until the last edit has had time to come back", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const { el, bridge } = setup({ text: "xyz", cursor: 3, anchor: 3 });
    browser(el, "xyzq", 4);
    bridge.input("insertText", "q");
    // The app's answer to an older edit: not written over what was typed.
    bridge.setApp(field({ text: "xyz", cursor: 3, anchor: 3 }));
    expect(el.value).toBe("xyzq");
    // The answer to this one: the same text, mirrored at once.
    bridge.setApp(field({ text: "xyzq", cursor: 4, anchor: 4 }));
    vi.advanceTimersByTime(SETTLE_MS + 100);
    expect(el.value).toBe("xyzq");
    // A change the tab didn't make, once things are quiet.
    bridge.setApp(field({ text: "XYZQ", cursor: 1, anchor: 1 }));
    expect(el.value).toBe("XYZQ");
  });

  it("follows a cursor the owner moved at once, even right after an edit", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const { el, bridge } = setup({ text: "ab", cursor: 2, anchor: 2 });
    browser(el, "abc", 3);
    bridge.input("insertText", "c");
    bridge.setApp(field({ text: "abc", cursor: 1, anchor: 1 }));
    expect([el.selectionStart, el.selectionEnd]).toEqual([1, 1]);
  });
});
