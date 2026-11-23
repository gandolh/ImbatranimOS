// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SystemProvider, type SystemHandle } from "@imbatranim/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("../../lib/axios", () => ({ api: { get, post, delete: del } }));
vi.mock("../linux-windows/launchers", () => ({ reloadLinuxLaunchers: vi.fn() }));

import { syncMarketplaceApps } from "../../shared/registry/marketplace";
import { LinuxAppsSettings } from "./LinuxAppsSettings";
import { useStreamStatsSwitch } from "../linux-windows/streamStats";
import { MarketplaceSettings } from "./MarketplaceSettings";
import { UpdatesSettings } from "./UpdatesSettings";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A poll that only feeds its own window stops while the window is hidden (minimized or on another
 * workspace, where it stays mounted), and runs once at once when the window shows again.
 */

let container: HTMLDivElement;
let root: Root;
let visible = true;
const listeners = new Set<() => void>();

const system = {
  windowId: "settings",
  window: { isVisible: () => visible },
  on: (event: string, cb: () => void) => {
    if (event !== "visibility") return () => undefined;
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  notify: vi.fn(),
} as unknown as SystemHandle;

async function setVisible(next: boolean) {
  visible = next;
  await act(async () => listeners.forEach((l) => l()));
}

const calls = (path: string) => get.mock.calls.filter(([p]) => p === path).length;
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  visible = true;
  listeners.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  syncMarketplaceApps([]);
  vi.useRealTimers();
});

async function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <SystemProvider system={system}>
        <QueryClientProvider client={client}>{node}</QueryClientProvider>
      </SystemProvider>,
    );
  });
  await advance(10);
}

/**
 * What `path`'s poll does: whether it polled while shown, how many requests it made in 10 s hidden, and how
 * many in the moment after showing again. A window's own poll should give `{ polled: true, hidden: 0, onShow: 1 }`.
 */
async function pollCounts(path: string, everyMs: number) {
  const before = calls(path);
  await advance(everyMs + 50);
  const polled = calls(path) > before;

  await setVisible(false);
  const atHide = calls(path);
  await advance(10_000);
  const hidden = calls(path) - atHide;

  const atShow = calls(path);
  await setVisible(true);
  await advance(10);
  return { polled, hidden, onShow: calls(path) - atShow };
}

const PAUSED = { polled: true, hidden: 0, onShow: 1 };

const runningJob = { id: 1, action: "update", target: "", state: "running", phase: null, log: "", error: null };

describe("polls stop while their window is hidden", () => {
  it("Updates: the job poll", async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === "/linux-apps/updates"
            ? { available: true, current: null, previous: null, checkedAt: null, update: null, upgrade: null }
            : { job: runningJob },
      }),
    );
    await render(<UpdatesSettings />);
    expect(await pollCounts("/linux-apps/job", 1000)).toEqual(PAUSED);
  });

  it("Marketplace: the listing poll while an install runs", async () => {
    const building = {
      id: "x-0123456789ab",
      descriptorId: "x-0123456789ab",
      descriptorName: "Hollow",
      name: "Hollow",
      description: "A small town sim.",
      meta: [],
      type: "static",
      icon: "gamepad-2",
      window: { defaultSize: { w: 960, h: 640 }, minSize: { w: 640, h: 400 } },
      capabilities: [],
      multiInstance: false,
      opens: [],
      minSystemVersion: 2,
      ref: "a".repeat(40),
      runtime: "native",
      installed: null,
      job: { state: "building" },
      server: { state: "stopped" },
    };
    get.mockResolvedValue({ data: { apps: [building], problems: [] } });
    await render(<MarketplaceSettings />);
    expect(await pollCounts("/marketplace", 2000)).toEqual(PAUSED);
  });

  it("Linux apps: the index poll while it builds, and the job poll", async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === "/linux-apps"
            ? { available: true, index: "building" }
            : path === "/linux-apps/job"
              ? { job: { ...runningJob, action: "install" } }
              : path === "/linux-apps/store"
                ? { bytes: 0 }
                : [],
      }),
    );
    await render(<LinuxAppsSettings />);
    expect(await pollCounts("/linux-apps", 2000)).toEqual(PAUSED);
  });

  it("Linux apps: the job poll", async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === "/linux-apps"
            ? { available: true, index: "ready" }
            : path === "/linux-apps/job"
              ? { job: { ...runningJob, action: "install" } }
              : path === "/linux-apps/store"
                ? { bytes: 0 }
                : [],
      }),
    );
    await render(<LinuxAppsSettings />);
    expect(await pollCounts("/linux-apps/job", 1000)).toEqual(PAUSED);
  });
});

describe("Settings → Linux apps: Show stream stats", () => {
  it("turns the overlay's switch on and off", async () => {
    get.mockImplementation((path: string) =>
      Promise.resolve({
        data:
          path === "/linux-apps"
            ? { available: true, index: "ready" }
            : path === "/linux-apps/store"
              ? { bytes: 0 }
              : [],
      }),
    );
    useStreamStatsSwitch.setState({ on: false });
    await render(<LinuxAppsSettings />);
    const box = () => container.querySelector("[data-linux-stream-stats] [role=checkbox]");
    expect(box()?.getAttribute("aria-checked")).toBe("false");
    await act(async () => box()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useStreamStatsSwitch.getState().on).toBe(true);
    await act(async () => box()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(useStreamStatsSwitch.getState().on).toBe(false);
  });
});
