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

type LinkHandler = {
  activate: (e: MouseEvent, uri: string, range: unknown) => void;
  hover?: (e: MouseEvent, uri: string, range: unknown) => void;
  leave?: (e: MouseEvent, uri: string, range: unknown) => void;
  allowNonHttpProtocols?: boolean;
};

class FakeXTerm {
  static last: FakeXTerm | null = null;
  linkHandler: LinkHandler | null = null;
  /** One line of output, where an OSC 8 link's text sits. */
  line = "see docs here";
  buffer = {
    active: {
      getLine: () => ({
        translateToString: (_trim: boolean, from = 0, to?: number) => this.line.slice(from, to),
      }),
    },
  };
  modes = { bracketedPasteMode: false };
  pasted: string[] = [];
  options: Record<string, unknown> = {};
  unicode = { activeVersion: "6" };
  cols = 80;
  rows = 24;
  textarea: HTMLTextAreaElement | null = null;
  /** The OSC handlers the app registered, by number. */
  osc = new Map<number, (payload: string) => boolean>();
  parser = {
    registerOscHandler: (code: number, handler: (payload: string) => boolean) => {
      this.osc.set(code, handler);
      return { dispose: () => this.osc.delete(code) };
    },
  };
  titleListener: ((title: string) => void) | null = null;
  markers: { line: number; isDisposed: boolean }[] = [];
  constructor(options: { linkHandler?: LinkHandler }) {
    FakeXTerm.last = this;
    this.linkHandler = options.linkHandler ?? null;
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
  onTitleChange(listener: (title: string) => void) {
    this.titleListener = listener;
    return { dispose: () => (this.titleListener = null) };
  }
  registerMarker() {
    const marker = { line: this.markers.length, isDisposed: false };
    this.markers.push(marker);
    return marker;
  }
  /** What the shell prints, as far as the app's handlers see it. */
  emitOsc(code: number, payload: string) {
    return this.osc.get(code)?.(payload);
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
let webLinkCallback: ((e: MouseEvent, uri: string) => void) | null = null;
vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(cb: (e: MouseEvent, uri: string) => void) {
      webLinkCallback = cb;
    }
  },
}));
const sendInput = vi.fn();
const sendClose = vi.fn();
vi.mock("./hooks/usePtyConnection", () => ({
  usePtyConnection: () => ({
    status: { kind: "open" },
    sendInput,
    sendResize: () => {},
    sendClose,
    reconnect: () => {},
  }),
}));

const { Terminal } = await import("./Terminal");

let container: HTMLDivElement;
let root: Root;
let clipboard = "";

const notify = vi.fn();
const setTitle = vi.fn();
/** The close guard the Terminal gave its window. */
let closeGuard: (() => boolean | Promise<boolean>) | null = null;
let focused = false;
function makeSystem(): SystemHandle {
  return {
    windowId: "w1",
    notify,
    window: {
      isFocused: () => focused,
      onCloseRequest: (guard: () => boolean | Promise<boolean>) => {
        closeGuard = guard;
        return () => {
          closeGuard = null;
        };
      },
      savedState: () => null,
      saveState: () => undefined,
      setTitle,
    },
    appearance: { get: () => ({ theme: "light", accent: "blue" }), subscribe: () => () => undefined },
    on: () => () => undefined,
  } as unknown as SystemHandle;
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(async () => {
  sendInput.mockClear();
  sendClose.mockClear();
  setTitle.mockClear();
  notify.mockClear();
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
    (d) => d.textContent?.includes("Paste") || d.textContent?.includes("Open"),
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

describe("the shell's marks and titles", () => {
  it("follows the shell through a command, and keeps a marker at each prompt", () => {
    const t = term();
    const shown = () => ({ ...pane().dataset });
    act(() => {
      t.emitOsc(133, "A");
      t.emitOsc(7, "file://vm/home/imbatranim/a%0Ab");
      t.emitOsc(133, "B");
      t.emitOsc(133, "C");
    });
    expect(shown()).toMatchObject({ shellPhase: "running", shellCwd: "/home/imbatranim/a\nb" });
    act(() => {
      t.emitOsc(133, "D;2");
      t.emitOsc(133, "A");
    });
    expect(shown()).toMatchObject({ shellPhase: "prompt", shellExit: "2" });
    expect(t.markers).toHaveLength(2);
  });

  it("gives the window the title the shell or a program sets, cleaned", () => {
    act(() => term().titleListener?.("vim\x07 notes.txt"));
    expect(setTitle).toHaveBeenLastCalledWith("vim notes.txt");
    act(() => term().titleListener?.(""));
    expect(setTitle).toHaveBeenLastCalledWith("Terminal");
  });
});

describe("closing the Terminal's window", () => {
  it("at a prompt, tells the shell and closes at once", async () => {
    act(() => {
      term().emitOsc(133, "A");
    });
    expect(closeGuard).not.toBeNull();
    expect(sendClose).not.toHaveBeenCalled();
    expect(await closeGuard?.()).toBe(true);
    expect(sendClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("with no shell marks, closes at once as before", async () => {
    expect(await closeGuard?.()).toBe(true);
  });

  it("asks while a command runs, and keeps the window open on Cancel", async () => {
    act(() => {
      term().emitOsc(133, "A");
      term().emitOsc(133, "C");
    });
    let answer: boolean | undefined;
    await act(async () => {
      void Promise.resolve(closeGuard?.()).then((v) => (answer = v));
    });
    await settle();
    expect(document.body.textContent).toContain("A command is still running.");
    await act(async () => button("Cancel").click());
    await settle();
    expect(answer).toBe(false);
    expect(sendClose).not.toHaveBeenCalled();

    await act(async () => {
      void Promise.resolve(closeGuard?.()).then((v) => (answer = v));
    });
    await settle();
    await act(async () => button("Close").click());
    await settle();
    expect(answer).toBe(true);
    expect(sendClose).toHaveBeenCalledTimes(1);
  });
});

describe("a long command's end", () => {
  afterEach(() => {
    vi.useRealTimers();
    focused = false;
  });

  const run = (seconds: number, end = "D;0") => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    act(() => {
      term().emitOsc(133, "A");
      term().emitOsc(133, "C");
    });
    vi.setSystemTime(seconds * 1000);
    act(() => {
      term().emitOsc(133, end);
    });
  };

  it("gives one toast after 11 s unfocused, with a Show for this window", () => {
    act(() => term().titleListener?.("~/projects/x"));
    run(11);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      title: "Command finished",
      body: "11 s in ~/projects/x",
      level: "info",
      actions: [{ label: "Show", payload: { showWindow: "w1" } }],
    });
  });

  it("gives nothing after 9 s, or when the window is focused", () => {
    run(9);
    focused = true;
    run(11);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says a failed command's code", () => {
    run(11, "D;2");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Command failed, exit 2", level: "warning" }));
  });

  it("gives nothing with the switch off", () => {
    localStorage.setItem("imbatranim:terminal:notify-long-commands", "off");
    run(11);
    localStorage.clear();
    expect(notify).not.toHaveBeenCalled();
  });
});

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

describe("links in the Terminal", () => {
  const range = { start: { x: 5, y: 1 }, end: { x: 8, y: 1 } }; // "docs"
  const click = new MouseEvent("click", { clientX: 200, clientY: 120 });
  let open: ReturnType<typeof vi.spyOn>;
  let nativeConfirm: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    open = vi.spyOn(window, "open").mockReturnValue(null);
    nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    open.mockRestore();
    nativeConfirm.mockRestore();
  });

  const handler = () => {
    const h = term().linkHandler;
    if (!h) throw new Error("no link handler");
    return h;
  };

  it("hands every OSC 8 scheme to its own handler, so a refused one can say why", () => {
    expect(handler().allowNonHttpProtocols).toBe(true);
  });

  it("opens an https OSC 8 link in a new tab, with no window handle and no native confirm", async () => {
    await act(async () => handler().activate(click, "https://example.com", range));
    await settle();
    expect(open).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("refuses a javascript: or file: target with a toast, and opens nothing", async () => {
    for (const uri of ["javascript:alert(1)", "file:///etc/passwd", "vscode://x"]) {
      await act(async () => handler().activate(click, uri, range));
    }
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "The Terminal opens only web links" }));
  });

  it("sends a plain URL through the same rule", async () => {
    await act(async () => webLinkCallback?.(click, "http://example.org/x"));
    await settle();
    expect(open).toHaveBeenCalledWith("http://example.org/x", "_blank", "noopener,noreferrer");
  });

  it("shows an OSC 8 link's target at the pointer while it is hovered", async () => {
    await act(async () => handler().hover?.(click, "https://example.com/where", range));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("https://example.com/where");
    await act(async () => handler().leave?.(click, "https://example.com/where", range));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("on a screen with no hover, asks before a link whose text isn't its address, naming the host", async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q !== "(hover: hover)" })) as unknown as typeof window.matchMedia;
    try {
      await act(async () => handler().activate(click, "https://example.com/x", range));
      await settle();
      expect(question()?.textContent).toContain("example.com");
      expect(open).not.toHaveBeenCalled();
      await act(async () => button("Open").click());
      await settle();
      expect(open).toHaveBeenCalledWith("https://example.com/x", "_blank", "noopener,noreferrer");
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
