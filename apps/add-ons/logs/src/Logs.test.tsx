// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SystemProvider, type SystemHandle } from "@imbatranim/ui";
import { Logs } from "./Logs";

/**
 * Follow reads the log every few seconds for this window alone, so it stops while the window is hidden
 * (minimized or on another workspace, where it stays mounted) and reads once at once when it shows again.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.getAnimations ??= () => [];
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let container: HTMLDivElement;
let root: Root;
let visible = true;
const listeners = new Set<() => void>();
const get = vi.fn(() => Promise.resolve({ data: { entries: [], nextCursor: null } }));

const system = {
  windowId: "logs",
  http: { get },
  window: { isVisible: () => visible, setTitle: () => undefined },
  on: (event: string, cb: () => void) => {
    if (event !== "visibility") return () => undefined;
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  notify: vi.fn(),
} as unknown as SystemHandle;

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
async function setVisible(next: boolean) {
  visible = next;
  await act(async () => listeners.forEach((l) => l()));
}

beforeEach(async () => {
  vi.useFakeTimers();
  get.mockClear();
  visible = true;
  listeners.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SystemProvider system={system}>
        <Logs />
      </SystemProvider>,
    );
  });
  await advance(300);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function followToggle(): HTMLElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Follow"));
  if (!found) throw new Error("no Follow toggle");
  return found;
}

describe("Logs' follow mode", () => {
  it("reads nothing while the window is hidden, and once at once when it shows", async () => {
    await act(async () => followToggle().click());
    const shown = get.mock.calls.length;
    await advance(3100);
    expect(get.mock.calls.length).toBeGreaterThan(shown);

    await setVisible(false);
    const hidden = get.mock.calls.length;
    await advance(10_000);
    expect(get.mock.calls.length).toBe(hidden);

    await setVisible(true);
    await advance(10);
    expect(get.mock.calls.length).toBe(hidden + 1);
  });
});
