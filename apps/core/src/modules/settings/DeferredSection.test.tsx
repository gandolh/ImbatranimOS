// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeferredSection } from "./DeferredSection";

/** An IntersectionObserver whose callback the test calls; it never fires by itself. */
let fire: ((isIntersecting: boolean) => void) | null = null;
class FakeObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    fire = (isIntersecting) => callback([{ isIntersecting }]);
  }
  observe() {}
  disconnect() {}
}

describe("DeferredSection", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    fire = null;
  });

  const render = (now: boolean) =>
    act(() =>
      root.render(
        <div data-settings-page="">
          <DeferredSection now={now}>
            <p>the section</p>
          </DeferredSection>
        </div>,
      ),
    );

  it("holds the space and mounts nothing until the section nears the view", () => {
    render(false);
    expect(host.textContent).not.toContain("the section");
    expect(host.querySelector("[aria-busy]")).not.toBeNull();
    act(() => fire?.(false));
    expect(host.textContent).not.toContain("the section");
    act(() => fire?.(true));
    expect(host.textContent).toContain("the section");
  });

  it("mounts at once when asked for, as an intent for a row inside it does", () => {
    render(false);
    expect(host.textContent).not.toContain("the section");
    render(true);
    expect(host.textContent).toContain("the section");
  });

  it("mounts at once where there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(false);
    expect(host.textContent).toContain("the section");
  });
});
