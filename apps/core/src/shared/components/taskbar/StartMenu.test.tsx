// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { launchLinuxApp } = vi.hoisted(() => ({ launchLinuxApp: vi.fn() }));
vi.mock("../../../modules/linux-windows/launchers", () => ({
  launchLinuxApp,
  linuxLauncherActions: (appId: string) =>
    appId === "linux:firefox"
      ? [
          { id: "new-window", name: "New Window" },
          { id: "new-private-window", name: "New Private Window" },
        ]
      : [],
}));
const { searchAllSources, activateItem, enabled } = vi.hoisted(() => ({
  searchAllSources: vi.fn(),
  activateItem: vi.fn(),
  enabled: [
    { id: "linux:firefox", name: "Firefox", description: "A Linux app", icon: () => null },
    { id: "notepad", name: "Notepad", description: "Text", icon: () => null },
    { id: "terminal", name: "Terminal", description: "Shell", icon: () => null },
    { id: "marketplace-app", name: "Zed Draw", description: "Installed", icon: () => null },
    { id: "settings", name: "Settings", description: "Prefs", icon: () => null },
  ] as { id: string; name: string; description: string; icon: () => null }[],
}));
vi.mock("../../registry/enabledApps", () => ({ useEnabledApps: () => [...enabled] }));
vi.mock("../../commands/CommandSourcesRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../commands/CommandSourcesRegistry")>()),
  searchAllSources,
  activateItem,
}));
vi.mock("../../commands/coreSources", () => ({
  rankApps: <T extends { group: string }>(items: T[]) => [
    ...items.filter((i) => i.group === "Apps"),
    ...items.filter((i) => i.group !== "Apps"),
  ],
}));
vi.mock("../../../lib/recentFiles", () => ({
  useRecentFilesQuery: () => ({ data: [] }),
  clearRecentFiles: vi.fn(),
}));
vi.mock("../brand/Logo", () => ({ Logo: () => null }));

import { StartMenu } from "./StartMenu";
import { DEFAULT_START_PINS, useStartPinsStore } from "../../store/startPinsStore";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.getAnimations ??= () => [];

/**
 * A Linux entry in Start offers its desktop actions on right-click (Firefox's
 * New Window), and choosing one starts it the way the entry starts. Other
 * entries keep the browser's own menu.
 */

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onOpenApp = vi.fn();

function entry(appId: string): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-start-entry="${appId}"]`)!;
}

function rightClick(el: HTMLElement): MouseEvent {
  const ev = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 50,
    clientY: 60,
  });
  act(() => {
    el.dispatchEvent(ev);
  });
  return ev;
}

const menuItems = () => [...document.querySelectorAll('[role="menu"][aria-label^="Actions for"] [role="menuitem"]')];

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onClose.mockReset();
  onOpenApp.mockReset();
  launchLinuxApp.mockReset();
  searchAllSources.mockReset();
  activateItem.mockReset();
  useStartPinsStore.setState({ pins: DEFAULT_START_PINS });
  await act(async () => {
    root.render(<StartMenu onClose={onClose} onOpenApp={onOpenApp} anchorRef={{ current: null }} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Start's entry menu", () => {
  it("lists a Linux entry's actions after Open", async () => {
    const ev = rightClick(entry("linux:firefox"));
    expect(ev.defaultPrevented).toBe(true);
    await act(async () => {});
    expect(menuItems().map((i) => i.textContent)).toEqual(["Open", "Pin to Start", "New Window", "New Private Window"]);
  });

  it("starts the chosen action, and a press in the menu leaves Start open until then", async () => {
    rightClick(entry("linux:firefox"));
    await act(async () => {});
    const newWindow = menuItems().find((i) => i.textContent === "New Window") as HTMLElement;
    act(() => {
      newWindow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => newWindow.click());
    expect(launchLinuxApp).toHaveBeenCalledExactlyOnceWith("linux:firefox", "new-window");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens the entry itself from Open", async () => {
    rightClick(entry("linux:firefox"));
    await act(async () => {});
    await act(async () => (menuItems()[0] as HTMLElement).click());
    expect(onOpenApp).toHaveBeenCalledWith("linux:firefox");
    expect(launchLinuxApp).not.toHaveBeenCalled();
  });

  it("offers Open and Unpin on a pinned entry that has no actions", async () => {
    rightClick(entry("notepad"));
    await act(async () => {});
    expect(menuItems().map((i) => i.textContent)).toEqual(["Open", "Unpin"]);
  });

  it("pins and unpins from the menu", async () => {
    rightClick(entry("linux:firefox"));
    await act(async () => {});
    await act(async () => (menuItems()[1] as HTMLElement).click());
    expect(useStartPinsStore.getState().pins).toContain("linux:firefox");
    rightClick(entry("notepad"));
    await act(async () => {});
    await act(async () => (menuItems()[1] as HTMLElement).click());
    expect(useStartPinsStore.getState().pins).not.toContain("notepad");
  });
});

const pinnedIds = () =>
  [...container.querySelectorAll("[data-start-pinned]")].map((e) => e.getAttribute("data-start-entry"));
const listIds = () =>
  [...container.querySelectorAll("[data-start-list]")].map((e) => e.getAttribute("data-start-entry"));

describe("Start's grid and A-Z list", () => {
  it("pins the default apps that exist and skips the ones that do not", () => {
    // Files, Browser and Code Editor are not in this fixture's roster.
    expect(pinnedIds()).toEqual(["terminal", "notepad", "settings"]);
  });

  it("lists every app A to Z with letter headers, installed and Linux ones included", () => {
    expect(listIds()).toEqual(["linux:firefox", "notepad", "settings", "terminal", "marketplace-app"]);
    const letters = [...container.querySelectorAll('[role="group"][aria-label]')]
      .map((g) => g.getAttribute("aria-label"))
      .filter((l) => l?.length === 1);
    expect(letters).toEqual(["F", "N", "S", "T", "Z"]);
  });

  it("shows an app that is switched off nowhere", async () => {
    const off = enabled.splice(1, 1)[0]; // Notepad
    try {
      await act(async () => {
        root.render(<StartMenu onClose={onClose} onOpenApp={onOpenApp} anchorRef={{ current: null }} />);
      });
      expect(container.querySelector('[data-start-entry="notepad"]')).toBeNull();
    } finally {
      enabled.splice(1, 0, off);
    }
  });

  it("draws the controls in the order search, grid, list, session", () => {
    const order = [...container.querySelectorAll("[data-start-nav]")].map(
      (e) => e.getAttribute("data-start-entry") ?? e.getAttribute("role"),
    );
    expect(order[0]).toBe("searchbox");
    expect(order.slice(1, 4)).toEqual(["terminal", "notepad", "settings"]);
    expect(order.slice(4, 9)).toEqual(["linux:firefox", "notepad", "settings", "terminal", "marketplace-app"]);
  });
});

function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const search = () => container.querySelector<HTMLInputElement>('input[role="searchbox"]')!;
const key = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });

describe("Start's search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchAllSources.mockResolvedValue([
      { id: "file:home:file:notes/zed.txt", label: "zed.txt", group: "Files" },
      { id: "app:notepad", label: "Notepad", subtitle: "Text", group: "Apps" },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  async function run(q: string) {
    type(search(), q);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  }

  it("takes the keyboard as Start opens on a device with a physical keyboard", () => {
    expect(document.activeElement).toBe(search());
  });

  it("ranks apps before files and swaps the grid and list for the results", async () => {
    await run("te");
    const rows = [...container.querySelectorAll("[data-start-result]")].map((e) => e.getAttribute("data-start-result"));
    expect(rows).toEqual(["app:notepad", "file:home:file:notes/zed.txt"]);
    expect(container.querySelector("[data-start-pinned]")).toBeNull();
    expect(container.querySelector("[data-start-list]")).toBeNull();
  });

  it("opens the top result on Enter, an app through Start and a file through the palette source", async () => {
    await run("te");
    key(search(), "Enter");
    await act(async () => {});
    expect(onOpenApp).toHaveBeenCalledWith("notepad");
    expect(onClose).toHaveBeenCalled();
    expect(activateItem).not.toHaveBeenCalled();
  });

  it("opens a file result by its source", async () => {
    searchAllSources.mockResolvedValue([{ id: "file:home:file:a.txt", label: "a.txt", group: "Files" }]);
    await run("a.t");
    await act(async () => container.querySelector<HTMLElement>("[data-start-result]")!.click());
    expect(activateItem).toHaveBeenCalledWith(expect.objectContaining({ group: "Files" }));
  });

  it("moves from the search field into the results with the arrow keys", async () => {
    await run("te");
    key(search(), "ArrowDown");
    expect(document.activeElement?.getAttribute("data-start-result")).toBe("app:notepad");
    key(document.activeElement as HTMLElement, "ArrowDown");
    expect(document.activeElement?.getAttribute("data-start-result")).toBe("file:home:file:notes/zed.txt");
  });

  it("says so when nothing matches", async () => {
    searchAllSources.mockResolvedValue([]);
    await run("qqq");
    expect(container.textContent).toContain("Nothing found");
  });
});

describe("Start's size", () => {
  it("fits the space above the taskbar and scrolls its list inside", () => {
    const menu = container.querySelector<HTMLElement>('[role="menu"][aria-label="Start menu"]')!;
    expect(menu.className).toContain("max-h-[calc(100vh-72px)]");
    expect(menu.className).toContain("w-[320px]");
    expect(menu.className).toContain("max-w-[calc(100vw-16px)]");
    const list = container.querySelector<HTMLElement>('[role="group"][aria-label="Pinned"]')!.parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).toContain("min-h-0");
  });
});
