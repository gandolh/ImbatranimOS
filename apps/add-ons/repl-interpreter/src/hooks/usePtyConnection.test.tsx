// @vitest-environment jsdom
import { act, useCallback, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal as XTerm } from "@xterm/xterm";
import { usePtyConnection, type ShellTokenKeep } from "./usePtyConnection";

/**
 * The hook against a fake WebSocket: which shell each socket names, what a window keeps across a reload, and
 * the close frame. The gateway's side of the same story is in the backend's pty specs.
 */

class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(frame: string) {
    this.sent.push(frame);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  end(code: number, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  param(name: string) {
    return new URL(this.url).searchParams.get(name);
  }
}

const written: string[] = [];
/** The callback of the last write, which xterm calls once the data is parsed. */
let parsed: (() => void) | undefined;
const fakeTerm = {
  cols: 80,
  rows: 24,
  write: (d: string, cb?: () => void) => {
    written.push(d);
    parsed = cb;
  },
} as unknown as XTerm;

type Api = ReturnType<typeof usePtyConnection>;
const exposed: { api: Api | null } = { api: null };
function Probe({ keep, expose }: { keep?: ShellTokenKeep; expose: (api: Api) => void }) {
  const getTerm = useCallback(() => fakeTerm, []);
  const api = usePtyConnection({ getTerm, generation: 1, keep });
  useEffect(() => expose(api));
  return null;
}

/** A window's saved state, as the desktop keeps it. */
function windowState(initial: string | null = null) {
  let value = initial;
  return {
    saved: () => value,
    save: (token: string | null) => {
      value = token;
    },
    get value() {
      return value;
    },
  };
}

let container: HTMLDivElement;
let root: Root;
const mount = (keep?: ShellTokenKeep) => {
  act(() => {
    root.render(
      <Probe
        keep={keep}
        expose={(api) => {
          exposed.api = api;
        }}
      />,
    );
  });
};
const last = () => {
  const s = FakeSocket.all.at(-1);
  if (!s) throw new Error("no socket");
  return s;
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  written.length = 0;
  vi.stubGlobal("WebSocket", FakeSocket);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the shell a Terminal window names", () => {
  it("starts a shell under a new token, and keeps the token with the window", () => {
    const keep = windowState();
    mount(keep);
    expect(last().param("resume")).toBeNull();
    expect(last().param("shell")).toBe(keep.value);
    expect(keep.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("comes back to the kept shell after a reload", () => {
    mount(windowState("kept-token-1"));
    expect(last().param("resume")).toBe("kept-token-1");
    expect(last().param("shell")).toBeNull();
  });

  it("comes back to the same shell when a dropped socket reconnects", () => {
    const keep = windowState();
    mount(keep);
    const first = last();
    act(() => first.open());
    act(() => first.end(1006));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeSocket.all).toHaveLength(2);
    expect(last().param("resume")).toBe(keep.value);
  });

  it("starts a shell of its own when another tab holds the kept one", () => {
    const keep = windowState("copied-token");
    mount(keep);
    act(() => last().open());
    act(() => last().end(4409, "shell-attached"));
    expect(FakeSocket.all).toHaveLength(2);
    expect(keep.value).not.toBe("copied-token");
    expect(last().param("shell")).toBe(keep.value);
    expect(written.join("")).toContain("open in another tab");
  });

  it("still names its shell when the window keeps nothing, for as long as the mount lasts", () => {
    mount();
    const token = last().param("shell");
    expect(token).not.toBeNull();
    act(() => last().open());
    act(() => last().end(1006));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(last().param("resume")).toBe(token);
  });
});

describe("coming back to a shell", () => {
  it("sends none of xterm's answers to the replayed output's queries, then input again", () => {
    mount(windowState("kept-token-1"));
    const socket = last();
    act(() => socket.open());
    act(() => socket.onmessage?.({ data: "\x1bc~ # \x1b[6n" }));
    expect(written.at(-1)).toBe("\x1bc~ # \x1b[6n");
    act(() => {
      exposed.api?.sendInput("\x1b[1;5R");
    });
    expect(socket.sent.filter((f) => f.includes("input"))).toEqual([]);

    act(() => parsed?.());
    act(() => {
      exposed.api?.sendInput("l");
    });
    expect(socket.sent).toContain(JSON.stringify({ type: "input", data: "l" }));
  });

  it("treats a reset later in the stream as output, not a replay", () => {
    mount(windowState());
    const socket = last();
    act(() => socket.open());
    act(() => socket.onmessage?.({ data: "hello" }));
    act(() => socket.onmessage?.({ data: "\x1bc" }));
    act(() => {
      exposed.api?.sendInput("l");
    });
    expect(socket.sent).toContain(JSON.stringify({ type: "input", data: "l" }));
  });
});

describe("closing the window", () => {
  it("sends the close frame on the open socket", () => {
    mount(windowState());
    act(() => last().open());
    act(() => {
      exposed.api?.sendClose();
    });
    expect(last().sent).toContain(JSON.stringify({ type: "close" }));
  });
});
