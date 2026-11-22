// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SystemProvider, type SystemHandle } from "@imbatranim/ui";

/**
 * Every paste into the Terminal goes through one function: plain text goes straight in through xterm's own
 * paste, and text that could run a command as it lands (a line break the shell won't hold, a bracket's end
 * marker) asks first. xterm can't render in jsdom, so it is replaced by a fake with the members the app uses;
 * the PTY socket is replaced by a recorder.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.getAnimations ??= () => [];
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

class FakeXTerm {
  static last: FakeXTerm | null = null;
  modes = { bracketedPasteMode: false };
  pasted: string[] = [];
  options: Record<string, unknown> = {};
  unicode = { activeVersion: "6" };
  cols = 80;
  rows = 24;
  textarea: HTMLTextAreaElement | null = null;
  constructor() {
    FakeXTerm.last = this;
  }
  loadAddon() {}
  open(host: HTMLElement) {
    // xterm's helper textarea, where the browser delivers a keyboard paste.
    this.textarea = document.createElement("textarea");
    this.textarea.addEventListener("paste", (e) =>
      this.pasted.push(`textarea:${e.clipboardData?.getData("text/plain")}`),
    );
    host.appendChild(this.textarea);
  }
  onData() {
    return { dispose() {} };
  }
  attachCustomKeyEventHandler() {}
  paste(data: string) {
    this.pasted.push(data);
  }
  focus() {}
  getSelection() {
    return "";
  }
  dispose() {}
}

vi.mock("@xterm/xterm", () => ({ Terminal: FakeXTerm }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: class {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
const sendInput = vi.fn();
vi.mock("./hooks/usePtyConnection", () => ({
  usePtyConnection: () => ({ status: { kind: "open" }, sendInput, sendResize: () => {}, reconnect: () => {} }),
}));

const { Terminal } = await import("./Terminal");

let container: HTMLDivElement;
let root: Root;
let clipboard = "";

function makeSystem(): SystemHandle {
  return {
    windowId: "w1",
    notify: vi.fn(),
    appearance: { get: () => ({ theme: "light", accent: "blue" }), subscribe: () => () => undefined },
    on: () => () => undefined,
  } as unknown as SystemHandle;
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(async () => {
  sendInput.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: () => Promise.resolve(clipboard), writeText: () => Promise.resolve() },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SystemProvider system={makeSystem()}>
        <Terminal windowId="w1" />
      </SystemProvider>,
    );
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const term = () => {
  const t = FakeXTerm.last;
  if (!t) throw new Error("no terminal");
  return t;
};
const pane = () => {
  const host = term().textarea?.parentElement?.parentElement;
  if (!host) throw new Error("no pane");
  return host;
};
const question = () =>
  [...document.querySelectorAll('[role="alertdialog"]:not([data-closed]), [role="dialog"]:not([data-closed])')].find(
    (d) => d.textContent?.includes("Paste"),
  );

async function rightClickPaste(text: string) {
  clipboard = text;
  await act(async () => {
    pane().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  await settle();
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`button "${label}" not found`);
  return found;
}

describe("pasting into the Terminal", () => {
  it("never sends a right-click paste straight to the shell; a multi-line one asks first", async () => {
    await rightClickPaste("echo one\necho two");
    expect(sendInput).not.toHaveBeenCalled();
    expect(question()?.textContent).toContain("echo one");
    expect(term().pasted).toEqual([]);

    await act(async () => button("Paste").click());
    await settle();
    expect(term().pasted).toEqual(["echo one\necho two"]);
  });

  it("pastes nothing when the question is cancelled", async () => {
    await rightClickPaste("echo one\necho two");
    await act(async () => button("Cancel").click());
    await settle();
    expect(term().pasted).toEqual([]);
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("puts a plain one-line paste straight in, with control bytes made spaces", async () => {
    await rightClickPaste("ls\x03 -la");
    expect(question()).toBeUndefined();
    expect(term().pasted).toEqual(["ls  -la"]);
  });

  it("takes a keyboard paste before xterm's textarea does, so it arrives once and is checked", async () => {
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "pwd" } });
    await act(async () => {
      term().textarea?.dispatchEvent(event);
    });
    await settle();
    expect(term().pasted).toEqual(["pwd"]);
  });
});
