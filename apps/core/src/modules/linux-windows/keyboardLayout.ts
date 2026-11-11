import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { prefsStorage } from "../../lib/prefs";

/**
 * The keyboard layout Linux apps type in. Keys stay physical (`keymap.ts`
 * sends evdev codes); the Wayland host builds this layout's xkb keymap and
 * hands it to every app, so the same key types `ș` in Romanian and `;` in
 * US. The desktop's own windows are untouched: they type in the browser's
 * layout, as always. Ids match the host's `KEYBOARD_LAYOUTS` and the
 * backend's check.
 */
export const KEYBOARD_LAYOUTS = [
  { id: "us", label: "English (US)" },
  { id: "ro", label: "Romanian (standard)" },
] as const;

export type KeyboardLayoutId = (typeof KEYBOARD_LAYOUTS)[number]["id"];

type LinuxAppsPrefs = {
  keyboardLayout: KeyboardLayoutId;
  setKeyboardLayout: (id: KeyboardLayoutId) => void;
};

export const useLinuxAppsPrefs = create<LinuxAppsPrefs>()(
  persist(
    (set) => ({
      keyboardLayout: "us",
      setKeyboardLayout: (id) => set({ keyboardLayout: id }),
    }),
    {
      name: "imbatranimos:linux-apps",
      // A server-backed dotfile, like the other preferences: the layout
      // belongs to the owner, not to one browser.
      storage: createJSONStorage(() => prefsStorage),
      // An id from a newer desktop (or a hand-edited file) reads as US.
      merge: (saved, current) => {
        const id = (saved as Partial<LinuxAppsPrefs> | undefined)?.keyboardLayout;
        return {
          ...current,
          keyboardLayout: KEYBOARD_LAYOUTS.some((l) => l.id === id) ? (id as KeyboardLayoutId) : "us",
        };
      },
    },
  ),
);
