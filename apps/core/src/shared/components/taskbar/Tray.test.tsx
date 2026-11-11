// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, notify } = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
  notify: vi.fn(),
}));
vi.mock("../../../lib/axios", () => ({
  api: { get, put: () => Promise.resolve({ data: { written: 0 } }) },
}));
vi.mock("../../store/notificationStore", () => ({
  notify,
  useNotificationStore: (pick: (s: { notifications: never[]; dnd: boolean }) => unknown) =>
    pick({ notifications: [], dnd: false }),
}));
vi.mock("../notifications/NotificationPanel", () => ({ NotificationPanel: () => null }));

import { Tray } from "./Tray";
import { readTrayStats } from "./trayStats";
import { useSoundStore } from "../../store/soundStore";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The tray draws CPU and memory only from a real stats answer. Anything else
 * (a wrong API base's HTML, an empty object, a failed request) leaves the
 * tray drawn without them, instead of throwing and blanking the desktop.
 */

const GB = 1024 ** 3;
const STATS = {
  cpu: { percent: 12.4, cores: 4 },
  memory: { totalBytes: 8 * GB, usedBytes: 2 * GB, availableBytes: 6 * GB, percent: 25 },
  disk: {
    path: "/home",
    totalBytes: 100 * GB,
    usedBytes: 40 * GB,
    freeBytes: 60 * GB,
    percent: 40,
  },
};

let container: HTMLDivElement;
let root: Root;

async function renderTray() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Tray />
      </QueryClientProvider>,
    );
  });
  // Let the query settle (resolve or reject) and React draw the result.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const loadText = () => container.querySelector("[data-tray-load]")?.textContent ?? null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  get.mockReset();
  notify.mockReset();
  useSoundStore.setState({ volume: 1, muted: false });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Tray", () => {
  it("draws CPU and memory from a stats answer", async () => {
    get.mockResolvedValue({ data: STATS });
    await renderTray();
    expect(loadText()).toBe("12% · 2.0/8.0 GB");
  });

  it.each([
    ["an HTML page", "<!doctype html><html><body>desktop</body></html>"],
    ["an empty object", {}],
    ["a half answer", { cpu: { percent: 5 } }],
    ["strings for numbers", { cpu: { percent: "5" }, memory: { usedBytes: "1", totalBytes: "2" } }],
    ["null", null],
  ])("draws without CPU and memory when the answer is %s", async (_, body) => {
    get.mockResolvedValue({ data: body });
    await renderTray();
    expect(loadText()).toBeNull();
    // The rest of the tray is still there.
    expect(container.querySelector('[aria-label="Notifications"]')).not.toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it("draws without CPU and memory when the request fails", async () => {
    get.mockRejectedValue(new Error("Request failed with status code 404"));
    await renderTray();
    expect(loadText()).toBeNull();
    expect(container.querySelector('[aria-label="Notifications"]')).not.toBeNull();
  });

  it("warns once when the disk is nearly full", async () => {
    get.mockResolvedValue({ data: { ...STATS, disk: { ...STATS.disk, percent: 95 } } });
    await renderTray();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ title: "Disk almost full" });
  });
});

describe("the tray volume", () => {
  const speaker = () => container.querySelector<HTMLElement>("[data-tray-volume]")!;
  const shape = () => speaker().querySelector("[data-speaker]")?.getAttribute("data-speaker");

  it("shows muted, and roughly how loud", async () => {
    get.mockResolvedValue({ data: STATS });
    useSoundStore.setState({ volume: 0.8, muted: false });
    await renderTray();
    expect(speaker().getAttribute("aria-label")).toBe("Volume: 80%");
    expect(shape()).toBe("high");
    act(() => useSoundStore.setState({ volume: 0.2 }));
    expect(shape()).toBe("low");
    act(() => useSoundStore.setState({ volume: 0 }));
    expect(shape()).toBe("silent");
    act(() => useSoundStore.setState({ volume: 0.5, muted: true }));
    expect(shape()).toBe("muted");
    expect(speaker().getAttribute("aria-label")).toBe("Volume: muted");
  });

  it("opens a slider and a mute that set the OS volume", async () => {
    get.mockResolvedValue({ data: STATS });
    await renderTray();
    await act(async () => speaker().click());
    const slider = document.querySelector<HTMLInputElement>('input[type="range"][aria-label="Volume"]')!;
    expect(slider.value).toBe("100");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(slider, "30");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(useSoundStore.getState()).toMatchObject({ volume: 0.3, muted: false });
    const mute = document.querySelector<HTMLButtonElement>('button[aria-label="Mute"]')!;
    act(() => mute.click());
    expect(useSoundStore.getState().muted).toBe(true);
    expect(document.querySelector('button[aria-label="Unmute"]')).not.toBeNull();
  });
});

describe("readTrayStats", () => {
  it("reads the disk percent apart from CPU and memory", () => {
    expect(readTrayStats({ disk: { percent: 93 } })).toEqual({ load: null, diskPercent: 93 });
    expect(readTrayStats({ ...STATS, disk: { percent: "full" } }).diskPercent).toBeNull();
  });

  it("reads nothing from a body that is not an object", () => {
    for (const body of [undefined, null, "text", 42, []]) {
      expect(readTrayStats(body)).toEqual({ load: null, diskPercent: null });
    }
  });
});
