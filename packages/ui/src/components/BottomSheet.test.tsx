// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BottomSheet } from "./BottomSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 50))));

describe("BottomSheet (kit)", () => {
  it("rises inside the element it is given, so a window's sheet stays above the taskbar", async () => {
    const frame = document.createElement("div");
    document.body.appendChild(frame);
    act(() =>
      root.render(
        <BottomSheet open title="Insert" container={frame}>
          <p>Shapes</p>
        </BottomSheet>,
      ),
    );
    await settle();
    const sheet = frame.querySelector('[role="dialog"]');
    expect(sheet?.textContent).toContain("Insert");
    expect(sheet?.textContent).toContain("Shapes");
    expect(frame.querySelector(".absolute.inset-0.z-dialog")).not.toBeNull();
  });

  it("closes from its close button", async () => {
    const onOpenChange = vi.fn();
    act(() =>
      root.render(
        <BottomSheet open title="Pages" onOpenChange={onOpenChange}>
          <p>Thumbnails</p>
        </BottomSheet>,
      ),
    );
    await settle();
    const close = document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close"]');
    expect(close).not.toBeNull();
    act(() => close?.click());
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});
