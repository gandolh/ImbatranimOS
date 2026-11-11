// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLinuxAppsPrefs } from "./keyboardLayout";
import { LinuxWindowsConnection } from "./connection";
import { prefsStorage } from "../../lib/prefs";

/**
 * The keyboard layout for Linux apps: a preference that round-trips through
 * its dotfile, and reaches the host when the socket opens and whenever it
 * changes.
 */

class FakeSocket {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  readyState = 1;
  binaryType = "arraybuffer";
  sent: { type: string; layout?: string }[] = [];
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
}

const KEY = "imbatranimos:linux-apps";

beforeEach(() => {
  localStorage.clear();
  useLinuxAppsPrefs.setState({ keyboardLayout: "us" });
});

afterEach(() => vi.unstubAllGlobals());

describe("the keyboard layout preference", () => {
  it("round-trips through its dotfile", async () => {
    useLinuxAppsPrefs.getState().setKeyboardLayout("ro");
    const saved = prefsStorage.getItem(KEY) as string;
    expect(JSON.parse(saved).state.keyboardLayout).toBe("ro");
    // A fresh read (another browser signing in) gets it back.
    useLinuxAppsPrefs.setState({ keyboardLayout: "us" });
    prefsStorage.setItem(KEY, saved);
    await useLinuxAppsPrefs.persist.rehydrate();
    expect(useLinuxAppsPrefs.getState().keyboardLayout).toBe("ro");
  });

  it("reads a layout it does not offer as US", async () => {
    prefsStorage.setItem(KEY, JSON.stringify({ state: { keyboardLayout: "xx" }, version: 0 }));
    await useLinuxAppsPrefs.persist.rehydrate();
    expect(useLinuxAppsPrefs.getState().keyboardLayout).toBe("us");
  });
});

describe("sending it to the host", () => {
  it("goes out when the socket opens and again when it changes", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    useLinuxAppsPrefs.getState().setKeyboardLayout("ro");
    const connection = new LinuxWindowsConnection();
    connection.start();
    const ws = FakeSocket.last!;
    ws.onopen?.();
    const layouts = () => ws.sent.filter((m) => m.type === "keyboard_layout").map((m) => m.layout);
    expect(layouts()).toEqual(["ro"]);
    useLinuxAppsPrefs.getState().setKeyboardLayout("us");
    expect(layouts()).toEqual(["ro", "us"]);
    // Setting the same layout again says nothing.
    useLinuxAppsPrefs.getState().setKeyboardLayout("us");
    expect(layouts()).toEqual(["ro", "us"]);
    connection.stop();
    useLinuxAppsPrefs.getState().setKeyboardLayout("ro");
    expect(layouts()).toEqual(["ro", "us"]);
  });
});
