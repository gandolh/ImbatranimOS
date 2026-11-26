// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("../store/notificationStore", () => ({ notify }));

import { lazyPart } from "./lazyPart";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A shell part whose chunk is a promise the test settles. */
function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}</p>;
}

let container: HTMLDivElement;
let root: Root;

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  notify.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("a lazily loaded part of the shell", () => {
  it("draws nothing while its chunk loads, then the part", async () => {
    const Part = lazyPart("Greeting", () => Promise.resolve(Greeting));
    act(() => root.render(<Part name="Ana" />));
    expect(container.textContent).toBe("");
    await settle();
    expect(container.textContent).toBe("Hello, Ana");
  });

  it("loads the chunk once, whether preloaded or rendered", async () => {
    const load = vi.fn(() => Promise.resolve(Greeting));
    const Part = lazyPart("Greeting", load);
    Part.preload();
    act(() => root.render(<Part name="Ana" />));
    await settle();
    act(() => root.render(<Part name="Bo" />));
    await settle();
    expect(container.textContent).toBe("Hello, Bo");
    // The preload and the first render; the module system keeps one copy of the chunk.
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("says so when its chunk does not arrive, keeps the rest drawn, and asks again next time", async () => {
    const load = vi
      .fn<() => Promise<typeof Greeting>>()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValue(Greeting);
    const Part = lazyPart("Greeting", load);
    act(() =>
      root.render(
        <div>
          <span>taskbar</span>
          <Part name="Ana" />
        </div>,
      ),
    );
    await settle();
    expect(container.textContent).toBe("taskbar");
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "Greeting could not load", level: "error" }),
    );

    // The same part with new props (the palette opened again) asks for the chunk again.
    act(() =>
      root.render(
        <div>
          <span>taskbar</span>
          <Part name="Bo" />
        </div>,
      ),
    );
    await settle();
    expect(container.textContent).toBe("taskbarHello, Bo");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("asks again when it mounts again after a failure", async () => {
    const load = vi
      .fn<() => Promise<typeof Greeting>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(Greeting);
    const Part = lazyPart("Greeting", load);
    act(() => root.render(<Part name="Ana" />));
    await settle();
    expect(container.textContent).toBe("");
    act(() => root.render(null));
    act(() => root.render(<Part name="Ana" />));
    await settle();
    expect(container.textContent).toBe("Hello, Ana");
  });
});
