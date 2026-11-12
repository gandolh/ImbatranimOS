// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfirmDialog } from "./ConfirmDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 50))));
const pressEscape = () =>
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
const pressOutside = () =>
  act(() => {
    const target = document.querySelector(".z-scrim") ?? document.body;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
  });
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLButtonElement;

describe("ConfirmDialog (kit)", () => {
  it("is an alertdialog with Cancel focused, and Esc cancels", async () => {
    const onCancel = vi.fn();
    act(() =>
      root.render(<ConfirmDialog open title="Delete" message="Sure?" onConfirm={() => {}} onCancel={onCancel} />),
    );
    await settle();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(button("Cancel"));
    pressEscape();
    await settle();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores Esc, the backdrop and Cancel while its action runs", async () => {
    const onCancel = vi.fn();
    let finish: () => void = () => {};
    const onConfirm = () => new Promise<void>((resolve) => (finish = resolve));
    act(() =>
      root.render(<ConfirmDialog open title="Delete" message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />),
    );
    await settle();
    act(() => button("Confirm").click());
    await settle();
    expect(button("Working…")).toBeDefined();
    pressEscape();
    pressOutside();
    act(() => button("Cancel").click());
    await settle();
    expect(onCancel).not.toHaveBeenCalled();
    expect(button("Working…").disabled).toBe(true);

    await act(async () => finish());
    await settle();
    expect(button("Confirm").disabled).toBe(false);
  });
});
