// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Recents are read through the API; these tests only need one entry, and
// openApp's recording of the open is a fire-and-forget POST.
vi.mock("../../lib/recentFiles", () => ({
  recordRecentFile: vi.fn(),
  clearRecentFiles: vi.fn(),
  fetchRecentFiles: vi.fn(async () => []),
  useRecentFilesQuery: () => ({
    data: [{ id: 1, root: "home", path: "lists/today.json", appId: "clock", lastOpened: "" }],
  }),
}));

import { openApp } from "./openApp";
import { recentFilesSource } from "../commands/recentFilesSource";
import { StartMenu } from "../components/taskbar/StartMenu";
import { NotificationPanel } from "../components/notifications/NotificationPanel";
import { forgetWindowFocus } from "../components/window/focusIntoWindow";
import { useWindowStore } from "../store/windowStore";
import { useIntentStore } from "../store/intentStore";
import { useAddonStore } from "../store/addonStore";
import { useNotificationStore } from "../store/notificationStore";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.getAnimations ??= () => [];

/**
 * `openApp` moves the keyboard into a window it raises, so every launcher
 * gets it without doing anything: the palette's recent files, Start's recent
 * files and the Notification panel's rows once raised an open window and left
 * the keyboard on the launcher. A new window gets it from its own mount, so
 * `openApp` leaves that one alone.
 *
 * The windows are the real store's; the DOM is a fixture shaped like
 * Window.tsx's (`data-window-id`, a content area), since no window renders.
 */

let frames: FrameRequestCallback[];
let container: HTMLDivElement;
let root: Root;

function flushFrames() {
  // A frame can schedule another (the new-window path does); run until quiet.
  for (let i = 0; i < 5 && frames.length; i++) {
    const now = frames;
    frames = [];
    for (const cb of now) cb(0);
  }
}

/** A window's DOM as Window.tsx lays it out, with one input in its content. */
function mountWindowDom(id: string): HTMLInputElement {
  const el = document.createElement("div");
  el.setAttribute("data-window-id", id);
  el.innerHTML = `<div class="titlebar"><button>_</button></div>
    <div data-window-content="" tabindex="-1"><input data-cmd="" /></div>`;
  document.body.appendChild(el);
  return el.querySelector("input")!;
}

/** Clock open behind Calculator, the keyboard on a launcher button. */
function openClockBehind(): { clockId: string; input: HTMLInputElement; launcher: HTMLElement } {
  const clockId = openApp("clock");
  openApp("calculator");
  const input = mountWindowDom(clockId);
  const launcher = document.createElement("button");
  document.body.appendChild(launcher);
  launcher.focus();
  flushFrames();
  return { clockId, input, launcher };
}

const topId = () =>
  useWindowStore
    .getState()
    .windows.filter((w) => w.isVisible)
    .sort((a, b) => b.zIndex - a.zIndex)[0]?.id;

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  useWindowStore.setState({ windows: [], nextZIndex: 1, closeGuards: {}, activeWorkspace: 1 });
  useIntentStore.setState({ intents: new Map() });
  useAddonStore.setState({ disabled: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  for (const w of useWindowStore.getState().windows) forgetWindowFocus(w.id);
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("openApp and the keyboard", () => {
  it("moves the keyboard into an open window it raises, a frame later", () => {
    const { clockId, input, launcher } = openClockBehind();
    expect(openApp("clock")).toBe(clockId);
    expect(document.activeElement).toBe(launcher);
    flushFrames();
    expect(topId()).toBe(clockId);
    expect(document.activeElement).toBe(input);
  });

  it("leaves a new window to its own mount", () => {
    const launcher = document.createElement("button");
    document.body.appendChild(launcher);
    launcher.focus();
    const id = openApp("clock");
    mountWindowDom(id);
    expect(frames).toHaveLength(0);
    expect(document.activeElement).toBe(launcher);
  });

  it("moves nothing for a refused open", () => {
    expect(openApp("removed-addon-for-this-test")).toBe("");
    expect(frames).toHaveLength(0);
  });
});

describe("launchers that raise an open window give it the keyboard", () => {
  it("the palette's recent files", () => {
    const { clockId, input } = openClockBehind();
    recentFilesSource.activate({
      id: "recent:home:clock:lists/today.json",
      label: "today.json",
      group: "Recent files",
    });
    flushFrames();
    expect(topId()).toBe(clockId);
    expect(document.activeElement).toBe(input);
  });

  it("Start's recent files", () => {
    const { clockId, input, launcher } = openClockBehind();
    // Closing the menu hands focus back to the Start button, as in the taskbar.
    const onClose = vi.fn(() => act(() => root.render(null)));
    act(() => {
      root.render(<StartMenu onClose={onClose} onOpenApp={() => undefined} anchorRef={{ current: launcher }} />);
    });
    const item = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
      b.textContent?.includes("today.json"),
    );
    expect(item).toBeDefined();
    act(() => item!.click());
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(launcher);
    flushFrames();
    expect(topId()).toBe(clockId);
    expect(document.activeElement).toBe(input);
  });

  it("the Notification panel's rows", () => {
    const { clockId, input } = openClockBehind();
    useNotificationStore.setState({
      notifications: [{ id: "n1", title: "Alarm", appId: "clock", level: "info", timestamp: 0, read: false }],
    });
    act(() => {
      root.render(<NotificationPanel onClose={() => undefined} />);
    });
    const row = container.querySelector<HTMLElement>('[role="button"]');
    expect(row?.textContent).toContain("Alarm");
    act(() => row!.click());
    flushFrames();
    expect(topId()).toBe(clockId);
    expect(document.activeElement).toBe(input);
  });
});
