// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/axios", () => ({
  api: {
    get: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: { written: 0 } }),
  },
}));

import { DOTFILE_KEYS, prefsStorage } from "../../lib/prefs";
import { DEFAULT_START_PINS, useStartPinsStore } from "./startPinsStore";

const KEY = "imbatranimos:start-pins";

beforeEach(() => {
  localStorage.clear();
  useStartPinsStore.setState({ pins: DEFAULT_START_PINS });
});

describe("Start's pins", () => {
  it("default to the six apps, in order", () => {
    expect(useStartPinsStore.getState().pins).toEqual([
      "file-manager",
      "terminal",
      "browser",
      "code-editor",
      "notepad",
      "settings",
    ]);
  });

  it("is a dotfile and round-trips through it", async () => {
    expect(DOTFILE_KEYS as readonly string[]).toContain(KEY);
    useStartPinsStore.getState().pin("linux:firefox");
    useStartPinsStore.getState().unpin("notepad");
    const saved = prefsStorage.getItem(KEY) as string;
    useStartPinsStore.setState({ pins: DEFAULT_START_PINS });
    prefsStorage.setItem(KEY, saved);
    await useStartPinsStore.persist.rehydrate();
    expect(useStartPinsStore.getState().pins).toEqual([
      "file-manager",
      "terminal",
      "browser",
      "code-editor",
      "settings",
      "linux:firefox",
    ]);
  });

  it("pins an app once", () => {
    useStartPinsStore.getState().pin("settings");
    expect(useStartPinsStore.getState().pins.filter((p) => p === "settings")).toHaveLength(1);
  });
});
