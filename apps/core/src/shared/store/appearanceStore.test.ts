// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two themes' stores and the one-time move. A machine saved before themes
 * existed moves to Apricot light once, keeping its old accent and wallpaper as
 * Classic's (decisions-themes.md, 2026-11-02), whichever way the saved blob
 * arrives: the localStorage mirror at import, or the server's copy on sign-in.
 */

const get = vi.fn();
const put = vi.fn();

vi.mock("../../lib/axios", () => ({
  api: {
    get: (...args: unknown[]) => get(...args) as unknown,
    put: (...args: unknown[]) => put(...args) as unknown,
    delete: () => Promise.resolve({ data: null }),
  },
}));

const APPEARANCE = "imbatranimos:appearance";
const WALLPAPER = "wallpaper-storage";

const loaded: { resetPrefsForTest: () => void }[] = [];

/** Fresh prefs + stores, as a new page load would have them, with writes counted. */
async function load() {
  vi.resetModules();
  const prefs = await import("../../lib/prefs");
  loaded.push(prefs);
  const setItem = vi.spyOn(prefs.prefsStorage, "setItem");
  const appearance = await import("./appearanceStore");
  const wallpaper = await import("./wallpaperStore");
  return { prefs, setItem, ...appearance, ...wallpaper };
}

/** The values written under `key`, parsed. */
function written(setItem: { mock: { calls: [string, string][] } }, key: string): unknown[] {
  return setItem.mock.calls.filter(([k]) => k === key).map(([, v]) => JSON.parse(v) as unknown);
}

beforeEach(() => {
  localStorage.clear();
  get.mockReset();
  put.mockReset();
  get.mockResolvedValue({ data: {} });
  put.mockResolvedValue({ data: { written: 0 } });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-os-theme");
});

afterEach(() => {
  for (const mod of loaded.splice(0)) mod.resetPrefsForTest();
});

describe("the appearance store", () => {
  it("starts in Apricot light when nothing is saved, and writes nothing", async () => {
    const { useAppearanceStore, setItem } = await load();
    const { theme, mode, accents } = useAppearanceStore.getState();
    expect({ theme, mode, accents }).toEqual({
      theme: "apricot",
      mode: "light",
      accents: { apricot: "apricot", classic: "crimson" },
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("moves a blob from before themes to Apricot light once, keeping its accent as Classic’s", async () => {
    localStorage.setItem(APPEARANCE, JSON.stringify({ state: { theme: "dark", accent: "cobalt" }, version: 0 }));
    const { useAppearanceStore, setItem } = await load();

    const { theme, mode, accents } = useAppearanceStore.getState();
    expect({ theme, mode, accents }).toEqual({
      theme: "apricot",
      mode: "light",
      accents: { apricot: "apricot", classic: "cobalt" },
    });
    expect(written(setItem, APPEARANCE)).toEqual([
      {
        state: {
          theme: "apricot",
          mode: "light",
          accents: { apricot: "apricot", classic: "cobalt" },
        },
        version: 1,
      },
    ]);

    // The next read finds version 1 and leaves it alone.
    await useAppearanceStore.persist.rehydrate();
    expect(written(setItem, APPEARANCE)).toHaveLength(1);
  });

  it("migrates the server’s copy too, when it arrives after sign-in", async () => {
    get.mockResolvedValue({
      data: {
        [APPEARANCE]: JSON.stringify({ state: { theme: "light", accent: "emerald" }, version: 0 }),
      },
    });
    const { useAppearanceStore, prefs, setItem } = await load();

    await prefs.hydratePrefs();
    await useAppearanceStore.persist.rehydrate();

    expect(useAppearanceStore.getState().accents.classic).toBe("emerald");
    expect(useAppearanceStore.getState().theme).toBe("apricot");
    expect(JSON.parse(prefs.pendingPrefsForTest()[APPEARANCE])).toMatchObject({ version: 1 });
    expect(written(setItem, APPEARANCE)).toHaveLength(1);
  });

  it("leaves a version-1 blob exactly as saved", async () => {
    const saved = {
      state: { theme: "classic", mode: "dark", accents: { apricot: "sky", classic: "signal" } },
      version: 1,
    };
    localStorage.setItem(APPEARANCE, JSON.stringify(saved));
    const { useAppearanceStore, setItem } = await load();

    const { theme, mode, accents } = useAppearanceStore.getState();
    expect({ theme, mode, accents }).toEqual(saved.state);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("sets the accent of the current theme only", async () => {
    const { useAppearanceStore } = await load();
    useAppearanceStore.getState().setAccent("rose");
    useAppearanceStore.getState().setTheme("classic");
    useAppearanceStore.getState().setAccent("emerald");
    // An id from the other theme is not this theme's accent.
    useAppearanceStore.getState().setAccent("sky");
    expect(useAppearanceStore.getState().accents).toEqual({ apricot: "rose", classic: "emerald" });
  });

  it("paints both attributes and the accent onto <html>", async () => {
    const { applyAppearance } = await load();
    const root = document.documentElement;

    applyAppearance({
      theme: "classic",
      mode: "dark",
      accents: { apricot: "apricot", classic: "cobalt" },
    });
    expect(root.getAttribute("data-os-theme")).toBe("classic");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.getPropertyValue("--accent")).toBe("#1f5fd6");

    applyAppearance({
      theme: "classic",
      mode: "light",
      accents: { apricot: "apricot", classic: "cobalt" },
    });
    expect(root.getAttribute("data-os-theme")).toBe("classic");
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});

describe("the wallpaper store", () => {
  it("starts each theme on its default", async () => {
    const { useWallpaperStore } = await load();
    expect(useWallpaperStore.getState().wallpapers).toEqual({
      apricot: "sunset-hills",
      classic: "dots",
    });
  });

  it("moves a blob from before themes once, keeping its wallpaper as Classic’s", async () => {
    localStorage.setItem(WALLPAPER, JSON.stringify({ state: { wallpaper: "grid" }, version: 0 }));
    const { useWallpaperStore, setItem } = await load();

    expect(useWallpaperStore.getState().wallpapers).toEqual({
      apricot: "sunset-hills",
      classic: "grid",
    });
    expect(written(setItem, WALLPAPER)).toEqual([
      { state: { wallpapers: { apricot: "sunset-hills", classic: "grid" } }, version: 1 },
    ]);
    await useWallpaperStore.persist.rehydrate();
    expect(written(setItem, WALLPAPER)).toHaveLength(1);
  });

  it("sets the wallpaper of the current theme, and only from its own set", async () => {
    const { useWallpaperStore, useAppearanceStore } = await load();
    useWallpaperStore.getState().setWallpaper("plain");
    useAppearanceStore.getState().setTheme("classic");
    useWallpaperStore.getState().setWallpaper("linen");
    useWallpaperStore.getState().setWallpaper("soft-dots");
    expect(useWallpaperStore.getState().wallpapers).toEqual({ apricot: "plain", classic: "linen" });
  });
});
