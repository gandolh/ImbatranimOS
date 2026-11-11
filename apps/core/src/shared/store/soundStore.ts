import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { prefsStorage } from "../../lib/prefs";

/**
 * The OS volume: the tray's slider and mute, over every sound the OS makes
 * (the media player and Linux apps' sound). `volume` runs from 0 to 1, a
 * media element's scale; the tray shows it as 0 to 100.
 *
 * A dotfile, like the other preferences: the owner's volume follows them to
 * another browser and survives a reload.
 */
export type SoundState = { volume: number; muted: boolean };

type SoundStore = SoundState & {
  /** Sets the level, clamped to 0..1 in steps of 0.01. Raising it above 0 unmutes. */
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
};

export const DEFAULT_SOUND: SoundState = { volume: 1, muted: false };

function level(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

/** A saved blob of any shape; anything unreadable falls back to the default, per field. */
export function readSound(saved: unknown): SoundState {
  const s = (saved ?? {}) as Record<string, unknown>;
  return {
    volume: typeof s.volume === "number" && Number.isFinite(s.volume) ? level(s.volume) : DEFAULT_SOUND.volume,
    muted: typeof s.muted === "boolean" ? s.muted : DEFAULT_SOUND.muted,
  };
}

/** The gain a sound source plays at: 0 while muted. */
export function soundGain(state: SoundState): number {
  return state.muted ? 0 : state.volume;
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SOUND,
      setVolume: (volume) =>
        set((s) => {
          const next = level(volume);
          // Dragging the slider up from a mute turns the sound back on, as on
          // Windows; dragging it while muted to 0 leaves it muted.
          return { volume: next, muted: next > 0 ? false : s.muted };
        }),
      setMuted: (muted) => set({ muted }),
    }),
    {
      name: "imbatranimos:sound",
      storage: createJSONStorage(() => prefsStorage),
      merge: (saved, current) => (saved === undefined ? current : { ...current, ...readSound(saved) }),
      partialize: ({ volume, muted }) => ({ volume, muted }),
    },
  ),
);
