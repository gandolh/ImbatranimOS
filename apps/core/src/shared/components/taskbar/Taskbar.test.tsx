// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { focusIntoWindowSoon, openApp } = vi.hoisted(() => ({
  focusIntoWindowSoon: vi.fn(),
  openApp: vi.fn<(appId: string) => string>(),
}));
vi.mock("../window/focusIntoWindow", () => ({ focusIntoWindowSoon }));
vi.mock("../../intents/openApp", () => ({ openApp }));
// The registry is the composition root (every add-on); the taskbar needs it
// only for icons.
vi.mock("../../registry/registry", () => ({ APP_REGISTRY: [] }));
vi.mock("./Tray", () => ({ Tray: () => null }));
vi.mock("./WorkspacePips", () => ({ WorkspacePips: () => null }));
vi.mock("../brand/Logo", () => ({ Logo: () => null }));
// Start renders one item that launches 'notepad', which is enough to drive
// the taskbar's launch path.
vi.mock("./StartMenu", () => ({
  StartMenu: ({ onOpenApp }: { onOpenApp: (appId: string) => void }) => (
    <button onClick={() => onOpenApp("notepad")}>Start: Notepad</button>
  ),
}));

import { useWindowStore, type WindowInstance } from "../../store/windowStore";
import { Taskbar } from "./Taskbar";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Raising a window from its task button moves the keyboard into it;
 * minimising the focused one leaves the keyboard on the button.
 */

function win(id: string, z: number, over: Partial<WindowInstance> = {}): WindowInstance {
  return {
    id,
    appId: "notepad",
    title: `Window ${id}`,
    workspaceId: 1,
    isVisible: true,
    isMaximized: false,
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    zIndex: z,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

const click = (label: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.title === label || b.getAttribute("aria-label") === label || b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`No button "${label}" in: ${container.textContent}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  useWindowStore.setState({
    windows: [win("a", 1), win("b", 2), win("c", 3, { isVisible: false })],
    activeWorkspace: 1,
    nextZIndex: 4,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Taskbar />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const top = () =>
  useWindowStore
    .getState()
    .windows.filter((w) => w.isVisible)
    .sort((x, y) => y.zIndex - x.zIndex)[0]?.id;

describe("Taskbar activation", () => {
  it("raises a background window and moves focus into it", () => {
    click("Window a");
    expect(top()).toBe("a");
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("restores a minimised window and moves focus into it", () => {
    click("Window c");
    const c = useWindowStore.getState().windows.find((w) => w.id === "c");
    expect(c?.isVisible).toBe(true);
    expect(top()).toBe("c");
    expect(focusIntoWindowSoon).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("minimises the focused window and leaves focus where it is", () => {
    click("Window b");
    const b = useWindowStore.getState().windows.find((w) => w.id === "b");
    expect(b?.isVisible).toBe(false);
    expect(focusIntoWindowSoon).not.toHaveBeenCalled();
  });

  it("launches from Start through openApp, which moves the keyboard itself", async () => {
    // openApp gives a window it raises the keyboard (openAppKeyboard.test.tsx);
    // the taskbar adds no second move of its own.
    openApp.mockReturnValue("a");
    click("Start");
    // Start's menu is its own chunk: it renders once that has loaded.
    await act(async () => {
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    click("Start: Notepad");
    expect(openApp).toHaveBeenCalledExactlyOnceWith("notepad");
    expect(focusIntoWindowSoon).not.toHaveBeenCalled();
  });
});

describe("a task button's progress and request for attention", () => {
  const button = (id: string) => container.querySelector<HTMLButtonElement>(`button[title="Window ${id}"]`);
  const bar = (id: string) => button(id)?.querySelector<HTMLElement>("[data-testid=task-progress] > span") ?? null;

  it("draws each progress state as its bar, and none for none", () => {
    const set = (state: "normal" | "error" | "indeterminate" | "paused" | null, value?: number) =>
      act(() => useWindowStore.getState().setWindowProgress("a", state ? { state, value } : null));

    set("normal", 40);
    expect(bar("a")?.className).toContain("bg-primary");
    expect(bar("a")?.style.width).toBe("40%");
    expect(button("a")?.getAttribute("aria-label")).toBe("Window a, 40% done");

    set("error", 40);
    expect(bar("a")?.className).toContain("bg-error");
    set("paused", 70);
    expect(bar("a")?.className).toContain("bg-on-surface-variant");
    expect(bar("a")?.style.width).toBe("70%");
    set("indeterminate");
    expect(bar("a")?.className).toContain("animate-[task-sweep");
    expect(bar("a")?.className).toContain("motion-reduce:bg-[repeating-linear-gradient");

    set(null);
    expect(bar("a")).toBeNull();
  });

  it("clamps a value to 0-100", () => {
    act(() => useWindowStore.getState().setWindowProgress("a", { state: "normal", value: 140 }));
    expect(bar("a")?.style.width).toBe("100%");
  });

  it("fills a window's button when it asks for attention, until it is focused", () => {
    act(() => useWindowStore.getState().requestAttention("a"));
    expect(button("a")?.hasAttribute("data-attention")).toBe(true);
    expect(button("a")?.className).toContain("bg-primary-container");
    expect(button("a")?.getAttribute("aria-label")).toBe("Window a, wants attention");

    click("Window a, wants attention");
    expect(useWindowStore.getState().windows.find((w) => w.id === "a")?.attention).toBe(false);
    expect(button("a")?.hasAttribute("data-attention")).toBe(false);
  });

  it("ignores the focused window's request", () => {
    act(() => useWindowStore.getState().requestAttention("b"));
    expect(useWindowStore.getState().windows.find((w) => w.id === "b")?.attention).toBeFalsy();
  });

  it("answers the request of a window that comes on top any other way", () => {
    act(() => useWindowStore.getState().requestAttention("a"));
    act(() => useWindowStore.getState().hideWindow("b"));
    expect(useWindowStore.getState().windows.find((w) => w.id === "a")?.attention).toBe(false);
  });
});
