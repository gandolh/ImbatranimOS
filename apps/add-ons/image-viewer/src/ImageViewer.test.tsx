// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemProvider, resetOpenedFilesForTest, type SystemHandle } from "@imbatranim/ui";
import { ImageViewer } from "./ImageViewer";
import { MAX_RANGE_BYTES } from "./api/readRange";
import { READ_CONCURRENCY } from "./lib/pool";
import type { FsEntry } from "./api/types";

/**
 * The By date view against a fake system: the toggle, the grid, the single
 * regroup, the progress line, the keys, the empty state, the step order after a
 * grid open and after a Files open, and what the date reads cost.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.getAnimations ??= () => [];
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// A little-endian Exif JPEG: IFD0 -> Exif IFD -> DateTimeOriginal.
function jpegWithDate(date: string): ArrayBuffer {
  const u16 = (n: number) => [n & 0xff, n >> 8];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];
  const entry = (tag: number, type: number, value: number[]) => [
    ...u16(tag),
    ...u16(type),
    ...u32(type === 2 ? 20 : 1),
    ...value,
  ];
  const exifAt = 8 + 18;
  const dateAt = exifAt + 18;
  const tiff = [
    0x49,
    0x49,
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...entry(0x8769, 4, u32(exifAt)),
    ...u32(0),
    ...u16(1),
    ...entry(0x9003, 2, u32(dateAt)),
    ...u32(0),
    ...[...date].map((c) => c.charCodeAt(0)),
    0,
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [
    0xff,
    0xd8,
    0xff,
    0xe1,
    (payload.length + 2) >> 8,
    (payload.length + 2) & 0xff,
    ...payload,
    0xff,
    0xda,
    0,
    2,
  ];
  return Uint8Array.from(bytes).buffer;
}

const file = (name: string, modifiedAt: string): FsEntry => ({
  name,
  path: `pics/${name}`,
  type: "file",
  size: 1000,
  modifiedAt,
});

// Name order: a, b, c, d. Date order: b (2025 by modified time), d, a (same day in
// 2024, d later), c (2023). a's modified time is 2020, so the Exif date is what counts.
const FOLDER: FsEntry[] = [
  file("a.jpg", "2020-01-01T10:00:00"),
  file("b.png", "2025-06-10T12:00:00"),
  file("c.jpg", "2019-01-01T10:00:00"),
  file("d.jpg", "2020-02-02T10:00:00"),
];
const EXIF: Record<string, string> = {
  "pics/a.jpg": "2024:03:09 09:00:00",
  "pics/c.jpg": "2023:01:05 08:00:00",
  "pics/d.jpg": "2024:03:09 15:30:00",
};

type Reads = { path: string; range: string }[];
type Opts = { entries?: FsEntry[]; hold?: boolean; open?: string; exif?: Record<string, string>; listFails?: number };

function setup(opts: Opts = {}) {
  const entries = opts.entries ?? FOLDER;
  const reads: Reads = [];
  const held: (() => void)[] = [];
  let inFlight = 0;
  let listCalls = 0;
  let maxInFlight = 0;
  const get = vi.fn(async (url: string, config?: { params?: { path: string }; headers?: Record<string, string> }) => {
    if (url === "/files") {
      if (listCalls++ < (opts.listFails ?? 0)) throw new Error("boom");
    }
    if (url === "/files") return { data: entries, status: 200, headers: {} };
    const path = config?.params?.path ?? "";
    reads.push({ path, range: config?.headers?.Range ?? "" });
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => (opts.hold ? held.push(resolve) : setTimeout(resolve, 0)));
    inFlight -= 1;
    const date = (opts.exif ?? EXIF)[path];
    return { data: date ? jpegWithDate(date) : new ArrayBuffer(0), status: 206, headers: {} };
  });
  const noop = () => {};
  const unsubscribe = () => noop;
  const openPath = opts.open ?? "pics/a.jpg";
  const system = {
    protocolVersion: 2,
    appId: "image-viewer",
    windowId: "w1",
    fs: {
      read: vi.fn(),
      readWithVersion: vi.fn(),
      upload: vi.fn(),
      downloadUrl: (_root: string, path: string) => `/dl/${path}`,
      pickOpen: vi.fn(),
      pickSave: vi.fn(),
      pickDirectory: vi.fn(),
      recordRecent: noop,
      removeRecent: noop,
      reopenRecent: async () => undefined,
    },
    http: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } as unknown as SystemHandle["http"],
    window: {
      setTitle: noop,
      requestClose: noop,
      focus: noop,
      hide: noop,
      show: noop,
      isFocused: () => true,
      isVisible: () => true,
      onCloseRequest: unsubscribe,
    },
    intents: {
      openApp: () => "",
      consume: () => undefined as never,
      onIntent: (cb: (p: unknown) => void) => {
        cb({ openPath, root: "home" });
        return noop;
      },
      associations: {
        resolveOpener: () => ({ appId: "notepad", reason: "declared" }),
        candidatesFor: () => [],
        allCandidates: () => [],
        keyFor: (name: string) => name.split(".").pop() ?? name,
        openerName: () => null,
        setDefault: noop,
      },
    },
    shortcuts: { register: unsubscribe, document: unsubscribe },
    appearance: { get: () => ({ theme: "light", accent: "#000" }) },
    schedule: { claim: async () => true },
    notify: () => "",
    on: unsubscribe,
  } as unknown as SystemHandle;
  return { system, reads, held, maxInFlight: () => maxInFlight };
}

let container: HTMLDivElement;
let root: Root;

const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function settle(times = 6) {
  for (let i = 0; i < times; i++) await tick();
}

async function render(opts: Opts = {}) {
  const s = setup(opts);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <SystemProvider system={s.system}>
          <ImageViewer windowId="w1" />
        </SystemProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
  return s;
}

const radio = (label: string) => container.querySelector<HTMLElement>(`[role="radio"][aria-label="${label}"]`)!;
const showGrid = async () => {
  act(() => radio("By date").click());
  await settle();
};
const tileNames = () =>
  [...container.querySelectorAll<HTMLElement>("[data-tile]")].map((t) => t.getAttribute("aria-label"));
const headings = () => [...container.querySelectorAll("h3")].map((h) => h.id);
const tile = (name: string) => container.querySelector<HTMLElement>(`[data-tile][aria-label="${name}"]`)!;
const grid = () => container.querySelector<HTMLElement>('[role="group"][aria-label="Photos by date"]');
const counter = () => container.textContent?.match(/(\d+|—) \/ (\d+|—)/)?.[0];
const key = (el: Element, k: string) =>
  act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
const currentImg = () => container.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt");

beforeEach(() => {
  resetOpenedFilesForTest();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the By date toggle", () => {
  it("starts on the single image and switches to the grid and back", async () => {
    await render();
    expect(radio("Single").getAttribute("aria-checked")).toBe("true");
    expect(grid()).toBeNull();
    expect(currentImg()).toBe("a.jpg");
    await showGrid();
    expect(radio("By date").getAttribute("aria-checked")).toBe("true");
    expect(grid()).not.toBeNull();
    act(() => radio("Single").click());
    await settle(1);
    expect(grid()).toBeNull();
    expect(currentImg()).toBe("a.jpg");
  });

  it("reads no dates until the grid is shown", async () => {
    const s = await render();
    expect(s.reads).toHaveLength(0);
    await showGrid();
    expect(s.reads.length).toBeGreaterThan(0);
  });
});

describe("the grid", () => {
  it("groups by the capture date, newest day first, with counts and lazy thumbnails", async () => {
    await render();
    await showGrid();
    expect(headings()).toEqual(["day-2025-06-10", "day-2024-03-09", "day-2023-01-05"]);
    expect(tileNames()).toEqual(["b.png", "d.jpg", "a.jpg", "c.jpg"]);
    const counts = [...container.querySelectorAll("h3 span")].map((s) => s.textContent);
    expect(counts).toEqual(["1", "2", "1"]);
    const img = tile("d.jpg").querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("src")).toBe("/dl/pics/d.jpg");
  });

  it("shows the progress line while dates are read, then regroups once", async () => {
    const s = await render({ hold: true });
    await showGrid();
    // Grouped by modified time meanwhile (a: 2020, c: 2019, d: 2020).
    const provisional = headings();
    expect(provisional).toEqual(["day-2025-06-10", "day-2020-02-02", "day-2020-01-01", "day-2019-01-01"]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Reading dates… 0 of 3");
    const seen: string[][] = [];
    const sequence: string[] = [];
    while (s.held.length > 0) {
      s.held.shift()?.();
      await settle(2);
      seen.push(headings());
      sequence.push(container.querySelector('[role="status"]')?.textContent ?? "");
    }
    // Every step before the last kept the modified-time grouping.
    expect(seen.slice(0, -1).every((h) => h.join() === provisional.join())).toBe(true);
    expect(sequence).toEqual(["Reading dates… 1 of 3", "Reading dates… 2 of 3", ""]);
    expect(headings()).toEqual(["day-2025-06-10", "day-2024-03-09", "day-2023-01-05"]);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("names the year in a day's heading only when it isn't this year", async () => {
    const thisYear = new Date().getFullYear();
    await render({
      entries: [file("new.png", `${thisYear}-01-15T12:00:00`), file("old.png", "2019-06-01T12:00:00")],
      open: "pics/new.png",
    });
    await showGrid();
    const titles = [...container.querySelectorAll("h3")].map((h) => h.firstChild?.textContent ?? "");
    expect(titles).toHaveLength(2);
    expect(titles[0]).not.toContain(String(thisYear));
    expect(titles[1]).toContain("2019");
  });

  it("dates a JPEG with no Exif by its modified time", async () => {
    await render({ exif: { "pics/a.jpg": "2024:03:09 09:00:00" } });
    await showGrid();
    expect(headings()).toEqual(["day-2025-06-10", "day-2024-03-09", "day-2020-02-02", "day-2019-01-01"]);
  });

  it("reads at most 64 KB a photo and six at a time", async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      file(`p${String(i).padStart(2, "0")}.jpg`, "2024-01-01T10:00:00"),
    );
    const s = await render({ entries: many, open: "pics/p00.jpg", exif: {} });
    await showGrid();
    const perPhoto = new Map<string, number>();
    for (const r of s.reads) {
      const [from, to] = r.range.replace("bytes=", "").split("-").map(Number);
      expect(to - from + 1).toBeLessThanOrEqual(MAX_RANGE_BYTES);
      perPhoto.set(r.path, (perPhoto.get(r.path) ?? 0) + (to - from + 1));
    }
    expect(perPhoto.size).toBe(20);
    for (const total of perPhoto.values()) expect(total).toBeLessThanOrEqual(MAX_RANGE_BYTES);
    expect(s.maxInFlight()).toBeLessThanOrEqual(READ_CONCURRENCY);
    expect(s.maxInFlight()).toBeGreaterThan(1);
  });

  it("shows an empty state for a folder with no images", async () => {
    await render({ entries: [], open: "pics/gone.jpg" });
    await showGrid();
    expect(container.textContent).toContain("No images in this folder");
    expect(container.querySelector("[data-tile]")).toBeNull();
  });

  it("says the folder couldn't be read when the listing fails, and Retry lists again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await render({ listFails: 1 });
    await showGrid();
    expect(container.textContent).toContain("Couldn't read this folder");
    expect(container.textContent).not.toContain("No images in this folder");
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Retry");
    expect(retry).toBeTruthy();
    await act(async () => {
      retry?.click();
    });
    await settle();
    expect(s.system.http.get).toHaveBeenCalledWith("/files", expect.anything());
    expect(container.textContent).not.toContain("Couldn't read this folder");
    expect(container.querySelector("[data-tile]")).not.toBeNull();
  });

  it("keeps an empty folder's message when the listing worked", async () => {
    await render({ entries: [], open: "pics/gone.jpg" });
    await showGrid();
    expect(container.textContent).not.toContain("Couldn't read this folder");
  });

  it("has one tab stop, moves it with the arrow keys and opens with Enter", async () => {
    await render();
    await showGrid();
    const tabStops = () => [...container.querySelectorAll<HTMLElement>("[data-tile]")].filter((t) => t.tabIndex === 0);
    // The photo the viewer was on (a.jpg) is the tab stop.
    expect(tabStops().map((t) => t.getAttribute("aria-label"))).toEqual(["a.jpg"]);
    key(tile("a.jpg"), "ArrowLeft");
    expect(tabStops().map((t) => t.getAttribute("aria-label"))).toEqual(["d.jpg"]);
    expect(document.activeElement).toBe(tile("d.jpg"));
    key(tile("d.jpg"), "ArrowRight");
    key(tile("a.jpg"), "ArrowRight");
    expect(tabStops().map((t) => t.getAttribute("aria-label"))).toEqual(["c.jpg"]);
    key(tile("c.jpg"), "ArrowRight"); // the last one stays
    expect(tabStops().map((t) => t.getAttribute("aria-label"))).toEqual(["c.jpg"]);
    key(tile("c.jpg"), "Home");
    expect(tabStops().map((t) => t.getAttribute("aria-label"))).toEqual(["b.png"]);
    key(tile("b.png"), "Enter");
    await settle(2);
    expect(grid()).toBeNull();
    expect(currentImg()).toBe("b.png");
  });
});

describe("stepping order", () => {
  const next = async () => {
    key(container.firstElementChild!, "ArrowRight");
    await settle(2);
  };

  it("follows date order after a photo is opened from the grid", async () => {
    await render();
    await showGrid();
    act(() => tile("b.png").click());
    await settle(2);
    expect(currentImg()).toBe("b.png");
    expect(counter()).toBe("1 / 4");
    const order = [currentImg()];
    for (let i = 0; i < 3; i++) {
      await next();
      order.push(currentImg());
    }
    expect(order).toEqual(["b.png", "d.jpg", "a.jpg", "c.jpg"]);
    await next();
    expect(currentImg()).toBe("b.png");
  });

  it("keeps the order the grid showed when the dates land after the open", async () => {
    // a's Exif date (2018) moves it below c once read; until then the grid shows modified order.
    const s = await render({ hold: true, exif: { "pics/a.jpg": "2018:01:01 10:00:00" } });
    await showGrid();
    expect(tileNames()).toEqual(["b.png", "d.jpg", "a.jpg", "c.jpg"]);
    act(() => tile("d.jpg").click());
    await settle(2);
    while (s.held.length > 0) {
      s.held.shift()?.();
      await settle(2);
    }
    await next();
    expect(currentImg()).toBe("a.jpg");
  });

  it("keeps the keyboard in the viewer after a photo opens from the grid", async () => {
    await render();
    await showGrid();
    act(() => tile("b.png").focus());
    act(() => tile("b.png").click());
    await settle(2);
    expect(document.activeElement).toBe(container.firstElementChild);
  });

  it("keeps name order when opened from Files", async () => {
    await render();
    const order = [currentImg()];
    for (let i = 0; i < 3; i++) {
      await next();
      order.push(currentImg());
    }
    expect(order).toEqual(["a.jpg", "b.png", "c.jpg", "d.jpg"]);
    expect(counter()).toBe("4 / 4");
  });

  it("keeps name order after only looking at the grid", async () => {
    await render();
    await showGrid();
    act(() => radio("Single").click());
    await settle(1);
    await next();
    expect(currentImg()).toBe("b.png");
  });
});
