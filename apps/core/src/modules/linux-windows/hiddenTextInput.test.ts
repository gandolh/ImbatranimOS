// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HiddenTextInput, TAP_WAIT_MS, TOUCH_FOCUS_KEY } from "./hiddenTextInput";
import { setLinuxSender, type LinuxTextInput } from "./linuxWindowsStore";

const field = (over: Partial<LinuxTextInput> = {}): LinuxTextInput => ({
  toplevel: 5,
  enabled: true,
  purpose: "normal",
  hints: [],
  text: "hello",
  cursor: 5,
  anchor: 5,
  rect: { x: 50, y: 60, width: 1, height: 18 },
  cause: "input_method",
  ...over,
});

const at = (x: number, y = 10) => ({ clientX: x, clientY: y });

let holder: HTMLDivElement;
let input: HiddenTextInput;
let sent: object[];

beforeEach(() => {
  holder = document.createElement("div");
  holder.tabIndex = 0;
  document.body.appendChild(holder);
  sent = [];
  setLinuxSender((m) => sent.push(m));
  // The window's geometry starts 10, 20 into its image.
  input = new HiddenTextInput(holder, 5, () => ({ x: 10, y: 20 }));
});

afterEach(() => {
  input.dispose();
  setLinuxSender(null);
  localStorage.clear();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("a Linux window's hidden input", () => {
  it("sits at the app's cursor, in the window body's coordinates", () => {
    input.update(field());
    const s = input.element.style;
    expect([s.left, s.top, s.height]).toEqual(["40px", "40px", "18px"]);
    expect(input.element.value).toBe("hello");
  });

  it("takes the focus on a tap while the app has a field enabled, and gives it back when the app lets go", () => {
    input.update(field());
    expect(input.touchDown(at(1))).toBe(false);
    input.touchUp(at(3));
    expect(document.activeElement).toBe(input.element);
    // Pressed again while it has the keyboard: the window leaves focus alone.
    expect(input.touchDown(at(1))).toBe(true);
    input.update(field({ enabled: false }));
    expect(document.activeElement).toBe(holder);
  });

  it("lets go of a field in another toplevel", () => {
    input.update(field());
    input.touchDown(at(1));
    input.touchUp(at(1));
    input.update(field({ toplevel: 9 }));
    expect(document.activeElement).toBe(holder);
  });

  it("takes the focus on the tap itself, and lets go when the app enables nothing in time", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    input.touchDown(at(1));
    input.touchUp(at(1));
    expect(document.activeElement).toBe(input.element);
    vi.advanceTimersByTime(TAP_WAIT_MS + 1);
    expect(document.activeElement).toBe(holder);
  });

  it("keeps the focus from the tap when the app enables a field in time", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    input.touchDown(at(1));
    input.touchUp(at(1));
    vi.advanceTimersByTime(200);
    input.update(field());
    vi.advanceTimersByTime(TAP_WAIT_MS);
    expect(document.activeElement).toBe(input.element);
  });

  it("waits for the app after the tap when set to, and never for a drag", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    localStorage.setItem(TOUCH_FOCUS_KEY, "after-enable");
    input.touchDown(at(1));
    input.touchUp(at(80));
    input.update(field());
    expect(document.activeElement).not.toBe(input.element);
    input.update(field({ enabled: false }));
    input.touchDown(at(1));
    input.touchUp(at(2));
    expect(document.activeElement).not.toBe(input.element);
    vi.advanceTimersByTime(300);
    input.update(field());
    expect(document.activeElement).toBe(input.element);
  });

  it("never takes the focus without a tap: a desktop click types as before", () => {
    input.update(field());
    expect(document.activeElement).not.toBe(input.element);
  });

  it("is a password input without suggestions for a password, and an email keyboard for an email", () => {
    input.update(field({ purpose: "password", text: null }));
    const el = input.element as HTMLInputElement;
    expect(el.type).toBe("password");
    expect(el.getAttribute("autocomplete")).toBe("off");
    expect(el.getAttribute("autocorrect")).toBe("off");
    expect(el.getAttribute("spellcheck")).toBe("false");
    expect(el.hasAttribute("inputmode")).toBe(false);
    input.update(field({ purpose: "email" }));
    expect(el.type).toBe("text");
    expect(el.getAttribute("inputmode")).toBe("email");
    expect(el.hasAttribute("autocomplete")).toBe(false);
  });

  it("becomes a textarea for a multiline field, keeping the focus", () => {
    input.update(field());
    input.touchDown(at(1));
    input.touchUp(at(1));
    input.update(field({ hints: ["multiline"], text: "a\nb", cursor: 3, anchor: 3 }));
    expect(input.element.tagName).toBe("TEXTAREA");
    expect(input.element.value).toBe("a\nb");
    expect(document.activeElement).toBe(input.element);
    expect(holder.querySelectorAll("[data-linux-text-input]")).toHaveLength(1);
  });

  it("sends a soft keyboard's Enter as a key, and leaves a physical key to the window", () => {
    input.update(field());
    const reachedWindow: string[] = [];
    holder.addEventListener("keydown", (e) => reachedWindow.push(e.code));
    const soft = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "",
      bubbles: true,
      cancelable: true,
    });
    input.element.dispatchEvent(soft);
    expect(soft.defaultPrevented).toBe(true);
    expect(sent).toEqual([
      { type: "key", keycode: 28, pressed: true },
      { type: "key", keycode: 28, pressed: false },
    ]);
    input.element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));
    expect(reachedWindow).toEqual(["KeyA"]);
  });
});
