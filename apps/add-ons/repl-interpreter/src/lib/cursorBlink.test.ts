import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLINK_TIMEOUT_MS, blinkWhileActive } from "./cursorBlink";

/** A terminal with only what the blink reads: its options, its input and its textarea. */
function fakeTerminal() {
  const listeners: ((data: string) => void)[] = [];
  // Only focus events are listened for, so an EventTarget stands in for the textarea (these tests run in node).
  const textarea = new EventTarget();
  const term = {
    options: { cursorBlink: true },
    textarea,
    onData: (fn: (data: string) => void) => {
      listeners.push(fn);
      return { dispose: () => listeners.splice(listeners.indexOf(fn), 1) };
    },
  };
  return { term, type: (data: string) => listeners.forEach((fn) => fn(data)), listeners };
}

describe("blinkWhileActive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("blinks for the timeout after it starts, then holds the cursor still", () => {
    const { term } = fakeTerminal();
    blinkWhileActive(term as never);
    vi.advanceTimersByTime(BLINK_TIMEOUT_MS - 1);
    expect(term.options.cursorBlink).toBe(true);
    vi.advanceTimersByTime(1);
    expect(term.options.cursorBlink).toBe(false);
  });

  it("counts the timeout from the last keystroke, with one timer at a time", () => {
    const { term, type } = fakeTerminal();
    blinkWhileActive(term as never);
    vi.advanceTimersByTime(6_000);
    type("l");
    type("s");
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(6_000);
    expect(term.options.cursorBlink).toBe(true);
    vi.advanceTimersByTime(4_000);
    expect(term.options.cursorBlink).toBe(false);
  });

  it("starts blinking again on typing or focus", () => {
    const { term, type } = fakeTerminal();
    blinkWhileActive(term as never);
    vi.advanceTimersByTime(BLINK_TIMEOUT_MS);
    expect(term.options.cursorBlink).toBe(false);
    type("x");
    expect(term.options.cursorBlink).toBe(true);
    vi.advanceTimersByTime(BLINK_TIMEOUT_MS);
    expect(term.options.cursorBlink).toBe(false);
    term.textarea.dispatchEvent(new Event("focus"));
    expect(term.options.cursorBlink).toBe(true);
  });

  it("leaves nothing behind once disposed", () => {
    const { term, type, listeners } = fakeTerminal();
    const blink = blinkWhileActive(term as never);
    blink.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners).toHaveLength(0);
    term.options.cursorBlink = false;
    type("x");
    term.textarea.dispatchEvent(new Event("focus"));
    expect(term.options.cursorBlink).toBe(false);
  });
});
