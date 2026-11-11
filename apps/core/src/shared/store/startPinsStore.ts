import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { prefsStorage } from "../../lib/prefs";

/** What Start pins until the user changes it. */
export const DEFAULT_START_PINS = ["file-manager", "terminal", "browser", "code-editor", "notepad", "settings"];

type StartPinsStore = {
  /** App ids in grid order. An id whose app is gone or switched off is skipped at render, not removed here. */
  pins: string[];
  pin: (appId: string) => void;
  unpin: (appId: string) => void;
};

/**
 * Which apps Start's grid shows. A server-backed dotfile like the desktop's,
 * so the grid follows the account to another browser.
 */
export const useStartPinsStore = create<StartPinsStore>()(
  persist(
    (set) => ({
      pins: DEFAULT_START_PINS,
      pin: (appId) => set((s) => (s.pins.includes(appId) ? s : { pins: [...s.pins, appId] })),
      unpin: (appId) => set((s) => (s.pins.includes(appId) ? { pins: s.pins.filter((id) => id !== appId) } : s)),
    }),
    {
      name: "imbatranimos:start-pins",
      storage: createJSONStorage(() => prefsStorage),
      version: 1,
    },
  ),
);
