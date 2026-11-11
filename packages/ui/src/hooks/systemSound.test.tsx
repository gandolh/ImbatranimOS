// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SystemProvider } from "../systemContext";
import { useSystemSound } from "./systemSound";
import type { SystemHandle, SystemSoundState } from "../system";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A handle with only what the hook reads: the OS volume and its event. */
function makeSystem(sound: SystemSoundState | null) {
  let listener: ((s: SystemSoundState) => void) | null = null;
  const system = {
    sound: sound === null ? undefined : { get: () => sound },
    on: (event: string, cb: (s: SystemSoundState) => void) => {
      if (event === "sound-changed") listener = cb;
      return () => (listener = null);
    },
  } as unknown as SystemHandle;
  return { system, change: (s: SystemSoundState) => listener?.(s) };
}

let seen: SystemSoundState[] = [];
function Probe() {
  seen.push(useSystemSound());
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  seen = [];
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

describe("useSystemSound", () => {
  it("reads the OS volume and follows its changes", () => {
    const { system, change } = makeSystem({ volume: 0.5, muted: false });
    act(() =>
      root.render(
        <SystemProvider system={system}>
          <Probe />
        </SystemProvider>,
      ),
    );
    expect(seen.at(-1)).toEqual({ volume: 0.5, muted: false });
    act(() => change({ volume: 0.5, muted: true }));
    expect(seen.at(-1)).toEqual({ volume: 0.5, muted: true });
  });

  it("plays at full volume on a desktop without one", () => {
    const { system } = makeSystem(null);
    act(() =>
      root.render(
        <SystemProvider system={system}>
          <Probe />
        </SystemProvider>,
      ),
    );
    expect(seen.at(-1)).toEqual({ volume: 1, muted: false });
  });
});
