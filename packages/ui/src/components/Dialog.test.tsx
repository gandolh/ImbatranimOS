// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dialog } from "./Dialog";
import { PromptDialog } from "./PromptDialog";

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

const pressEscape = (target: Element) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });

const pressOutside = () =>
  act(() => {
    const backdrop = document.querySelector("[data-open].z-scrim, .z-scrim") ?? document.body;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      backdrop.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
  });

describe("Dialog (kit)", () => {
  it("lets an Esc a nested control already used pass without closing", async () => {
    const onOpenChange = vi.fn();
    let handled = true;
    act(() =>
      root.render(
        <Dialog open onOpenChange={onOpenChange} title="Test">
          <input
            data-testid="field"
            onKeyDown={(e) => {
              if (e.key === "Escape" && handled) e.preventDefault();
            }}
          />
        </Dialog>,
      ),
    );
    await settle();
    pressEscape(document.querySelector("[data-testid=field]")!);
    await settle();
    expect(onOpenChange.mock.calls.filter(([next]) => next === false)).toHaveLength(0);

    handled = false;
    pressEscape(document.querySelector("[data-testid=field]")!);
    await settle();
    expect(onOpenChange.mock.calls.some(([next, details]) => next === false && details.reason === "escape-key")).toBe(
      true,
    );
  });

  it("puts initial focus on [data-autofocus], else the first field, never the X", async () => {
    act(() =>
      root.render(
        <Dialog open onOpenChange={() => {}} title="Test">
          <input data-testid="first" />
          <input data-testid="second" data-autofocus="" />
        </Dialog>,
      ),
    );
    await settle();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("second");

    act(() => root.unmount());
    root = createRoot(container);
    act(() =>
      root.render(
        <Dialog open onOpenChange={() => {}} title="Test">
          <input data-testid="first" />
        </Dialog>,
      ),
    );
    await settle();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("first");
  });

  it("labels the X for a screen reader", async () => {
    act(() =>
      root.render(
        <Dialog open onOpenChange={() => {}} title="Test">
          body
        </Dialog>,
      ),
    );
    await settle();
    expect(document.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it("closes on an outside press, unless disablePointerDismissal is set", async () => {
    const closes = vi.fn();
    act(() =>
      root.render(
        <Dialog open onOpenChange={(next) => !next && closes()} title="Plain">
          body
        </Dialog>,
      ),
    );
    await settle();
    pressOutside();
    await settle();
    expect(closes).toHaveBeenCalled();
  });

  it("keeps a PromptDialog open on an outside press", async () => {
    const onCancel = vi.fn();
    act(() =>
      root.render(
        <PromptDialog open value="" onValueChange={() => {}} title="Name" onConfirm={() => {}} onCancel={onCancel} />,
      ),
    );
    await settle();
    pressOutside();
    await settle();
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
