// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/axios", () => ({
  api: {
    get: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: { written: 0 } }),
  },
}));

import { DOTFILE_KEYS, prefsStorage } from "../../lib/prefs";
import { readSound, soundGain, useSoundStore } from "./soundStore";

/**
 * The OS volume: a preference that round-trips through its dotfile, reads
 * anything odd as full volume and unmuted, and unmutes when the slider goes
 * up.
 */

const KEY = "imbatranimos:sound";

beforeEach(() => {
  localStorage.clear();
  useSoundStore.setState({ volume: 1, muted: false });
});

describe("the sound preference", () => {
  it("is a dotfile", () => {
    expect(DOTFILE_KEYS as readonly string[]).toContain(KEY);
  });

  it("round-trips through its dotfile", async () => {
    useSoundStore.getState().setVolume(0.35);
    useSoundStore.getState().setMuted(true);
    const saved = prefsStorage.getItem(KEY) as string;
    expect(JSON.parse(saved).state).toEqual({ volume: 0.35, muted: true });
    // A fresh read (a reload, another browser signing in) gets it back.
    useSoundStore.setState({ volume: 1, muted: false });
    prefsStorage.setItem(KEY, saved);
    await useSoundStore.persist.rehydrate();
    expect(useSoundStore.getState()).toMatchObject({ volume: 0.35, muted: true });
  });

  it("reads a value it does not understand as the default, per field", async () => {
    prefsStorage.setItem(KEY, JSON.stringify({ state: { volume: "loud", muted: 1 }, version: 0 }));
    await useSoundStore.persist.rehydrate();
    expect(useSoundStore.getState()).toMatchObject({ volume: 1, muted: false });
    expect(readSound({ volume: 7, muted: true })).toEqual({ volume: 1, muted: true });
    expect(readSound({ volume: -1 })).toEqual({ volume: 0, muted: false });
    expect(readSound(null)).toEqual({ volume: 1, muted: false });
  });
});

describe("setting it", () => {
  it("clamps the level to 0..1 in steps of a hundredth", () => {
    useSoundStore.getState().setVolume(0.123456);
    expect(useSoundStore.getState().volume).toBe(0.12);
    useSoundStore.getState().setVolume(3);
    expect(useSoundStore.getState().volume).toBe(1);
    useSoundStore.getState().setVolume(-2);
    expect(useSoundStore.getState().volume).toBe(0);
  });

  it("turns the sound back on when the level goes up, and not when it goes to 0", () => {
    useSoundStore.getState().setMuted(true);
    useSoundStore.getState().setVolume(0);
    expect(useSoundStore.getState().muted).toBe(true);
    useSoundStore.getState().setVolume(0.4);
    expect(useSoundStore.getState().muted).toBe(false);
  });

  it("plays at the level, and at 0 while muted", () => {
    expect(soundGain({ volume: 0.6, muted: false })).toBe(0.6);
    expect(soundGain({ volume: 0.6, muted: true })).toBe(0);
  });
});
