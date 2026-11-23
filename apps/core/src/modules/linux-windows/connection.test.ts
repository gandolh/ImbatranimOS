// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWaylandUrl, LinuxWindowsConnection } from "./connection";
import { useLinuxWindowsStore } from "./linuxWindowsStore";
import { useWindowStore } from "../../shared/store/windowStore";
import { streamStats, useStreamStatsSwitch } from "./streamStats";

/** The tab's side of `/api/wayland`; the test speaks the backend's. */
class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  binaryType = "arraybuffer";
  sent: { type: string; toplevel?: number }[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as { type: string; toplevel?: number });
  }
  close() {
    this.closed = true;
  }
  say(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

/** A decoder that says it decodes VP8, then fails every frame. */
class BrokenDecoder {
  static isConfigSupported = vi.fn(async () => ({ supported: true }));
  state = "unconfigured";
  readonly onError: (e: unknown) => void;
  constructor(init: { error: (e: unknown) => void }) {
    this.onError = init.error;
  }
  configure() {
    this.state = "configured";
  }
  decode() {
    queueMicrotask(() => {
      this.state = "closed";
      this.onError(new Error("EncodingError"));
    });
  }
  close() {
    this.state = "closed";
  }
}

const created = (toplevel: number) => ({
  type: "toplevel_created",
  toplevel,
  title: "firefox",
  app_id: "firefox",
  width: 800,
  height: 600,
  scale: 1,
  geometry: { x: 0, y: 0, width: 800, height: 600 },
  decorations: "server",
  min_width: 0,
  min_height: 0,
  max_width: 0,
  max_height: 0,
});

/** One frame of `toplevel`: a 640×360 VP8 keyframe, as the socket carries it. */
function vp8Keyframe(toplevel: number): ArrayBuffer {
  const data = [0x10, 0, 0];
  const buf = new ArrayBuffer(15 + 21 + data.length);
  const v = new DataView(buf);
  v.setUint8(0, 2);
  v.setUint32(1, toplevel, true);
  v.setUint32(5, 800, true);
  v.setUint32(9, 600, true);
  v.setUint16(13, 1, true);
  v.setUint32(23, 640, true);
  v.setUint32(27, 360, true);
  v.setUint8(31, 4);
  v.setUint32(32, data.length, true);
  new Uint8Array(buf, 36).set(data);
  return buf;
}

const linuxWindows = () => useWindowStore.getState().windows.filter((w) => w.appId.startsWith("linux:"));

let connection: LinuxWindowsConnection;

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("VideoDecoder", BrokenDecoder);
  vi.stubGlobal(
    "EncodedVideoChunk",
    class {
      constructor(init: object) {
        Object.assign(this, init);
      }
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  // jsdom has no 2D canvas; the frames are decoded all the same.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  sessionStorage.clear();
  useWindowStore.setState({ windows: [], nextZIndex: 1, activeWorkspace: 1 });
  useLinuxWindowsStore.getState().clear();
});

afterEach(() => {
  connection?.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the socket's URL", () => {
  const size = { width: 1280, height: 720, ratio: 1.5 };

  it("sits beside the page's API, and names no codecs for a tab that decodes none", () => {
    vi.stubEnv("VITE_API_URL", "");
    const query = "?session=s%2Fone&width=1280&height=720&ratio=1.5";
    expect(buildWaylandUrl("s/one", size)).toBe(`ws://${window.location.host}/api/wayland${query}`);
    expect(buildWaylandUrl("s/one", size, [])).toBe(`ws://${window.location.host}/api/wayland${query}`);
  });

  it("names the codecs the tab decodes, comma-separated, last", () => {
    vi.stubEnv("VITE_API_URL", "");
    const url = new URL(buildWaylandUrl("abc", size, ["vp8"]));
    expect(url.searchParams.get("codecs")).toBe("vp8");
    expect(url.search).toBe("?session=abc&width=1280&height=720&ratio=1.5&codecs=vp8");
    expect(new URL(buildWaylandUrl("abc", size, ["vp8", "vp9"])).searchParams.get("codecs")).toBe("vp8,vp9");
  });

  it("follows an API on another host, wss for https, with or without codecs", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/base/");
    expect(buildWaylandUrl("abc", size)).toBe(
      "wss://api.example.test/base/wayland?session=abc&width=1280&height=720&ratio=1.5",
    );
    expect(buildWaylandUrl("abc", size, ["vp8"])).toBe(
      "wss://api.example.test/base/wayland?session=abc&width=1280&height=720&ratio=1.5&codecs=vp8",
    );
    vi.stubEnv("VITE_API_URL", "http://api.example.test");
    expect(buildWaylandUrl("abc", size, ["vp8"])).toMatch(/^ws:\/\/api\.example\.test\/wayland\?/);
  });
});

describe("a tab whose VP8 decoder keeps failing", () => {
  it("connects again without VP8, and its windows come back where they were", async () => {
    connection = new LinuxWindowsConnection();
    connection.start();
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const first = FakeSocket.all[0]!;
    expect(new URL(first.url).searchParams.get("codecs")).toBe("vp8");
    first.onopen?.();
    first.say({ type: "session", resumed: false });
    first.say(created(5));
    useWindowStore.getState().updatePosition(linuxWindows()[0]!.id, { x: 330, y: 140 });

    // Three keyframes, three failures: two keyframes asked for, then a new socket.
    for (let i = 0; i < 3; i++) first.onmessage?.({ data: vp8Keyframe(5) });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
    expect(first.sent.filter((m) => m.type === "keyframe")).toEqual([
      { type: "keyframe", toplevel: 5 },
      { type: "keyframe", toplevel: 5 },
    ]);
    expect(first.closed).toBe(true);
    const second = FakeSocket.all[1]!;
    expect(new URL(second.url).searchParams.has("codecs")).toBe(false);

    // The backend takes the session back, and the window goes where it was.
    second.onopen?.();
    second.say({ type: "session", resumed: true });
    second.say(created(5));
    expect(linuxWindows()[0]?.position).toEqual({ x: 330, y: 140 });

    // A later reconnect stays without VP8.
    vi.useFakeTimers();
    second.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(FakeSocket.all).toHaveLength(3);
    expect(new URL(FakeSocket.all[2]!.url).searchParams.has("codecs")).toBe(false);
  });
});

describe("a Linux app that asks for attention", () => {
  it("marks its window's taskbar button and raises nothing, until the window is focused", async () => {
    connection = new LinuxWindowsConnection();
    connection.start();
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const socket = FakeSocket.all[0]!;
    socket.onopen?.();
    socket.say({ type: "session", resumed: false });
    socket.say(created(5));
    socket.say(created(6));
    const [first, second] = linuxWindows();
    const top = () => [...useWindowStore.getState().windows].sort((a, b) => b.zIndex - a.zIndex)[0]?.id;
    expect(top()).toBe(second!.id);

    socket.say({ type: "request", toplevel: 5, action: "attention" });
    const state = () => useWindowStore.getState().windows.find((w) => w.id === first!.id);
    expect(state()?.attention).toBe(true);
    expect(top()).toBe(second!.id);

    useWindowStore.getState().focusWindow(first!.id);
    expect(state()?.attention).toBe(false);
  });
});

describe("stream stats on the frame path", () => {
  const frameOf = (toplevel: number): ArrayBuffer => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const head = new DataView(new ArrayBuffer(15 + 21));
    head.setUint8(0, 2);
    head.setUint32(1, toplevel, true);
    head.setUint32(5, 640, true);
    head.setUint32(9, 480, true);
    head.setUint16(13, 1, true);
    head.setUint32(15 + 8, 1, true);
    head.setUint32(15 + 12, 1, true);
    head.setUint8(15 + 16, 2);
    head.setUint32(15 + 17, data.byteLength, true);
    const out = new Uint8Array(15 + 21 + data.byteLength);
    out.set(new Uint8Array(head.buffer));
    out.set(data, 36);
    return out.buffer;
  };

  it("records nothing while the switch is off, and each painted frame while it is on", async () => {
    streamStats.clear();
    useStreamStatsSwitch.setState({ on: false });
    connection = new LinuxWindowsConnection();
    connection.start();
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const socket = FakeSocket.all[0]!;
    socket.onopen?.();
    socket.say({ type: "session", resumed: false });
    socket.say(created(5));
    socket.onmessage?.({ data: frameOf(5) });
    await new Promise((r) => setTimeout(r, 20));
    expect(streamStats.size).toBe(0);

    useStreamStatsSwitch.setState({ on: true });
    socket.onmessage?.({ data: frameOf(5) });
    await vi.waitFor(() => expect(streamStats.summary(5, performance.now()).fps).toBe(1));
    useStreamStatsSwitch.getState().setOn(false);
  });
});
