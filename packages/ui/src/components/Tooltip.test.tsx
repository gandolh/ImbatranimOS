// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tooltip } from "./Tooltip";
import { Toggle } from "./Toggle";
import { Radio, RadioGroup } from "./RadioGroup";

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
  vi.useRealTimers();
});

const popup = () => document.body.querySelector('[role="tooltip"], [data-side]');
const button = () => container.querySelector("button") as HTMLButtonElement;
const pointer = (el: Element, type: "pointerenter" | "pointerleave", pointerType = "mouse") => {
  act(() => {
    // jsdom has no PointerEvent: a MouseEvent carrying pointerType is what React reads. React makes onPointerEnter
    // and onPointerLeave from `pointerover` and `pointerout` with the other side outside the element.
    const native = type === "pointerenter" ? "pointerover" : "pointerout";
    const event = new MouseEvent(native, { bubbles: true, relatedTarget: document.body });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    el.dispatchEvent(event);
  });
};

describe("Tooltip (kit)", () => {
  it("renders the child alone until it is asked for", () => {
    act(() =>
      root.render(
        <Tooltip content="Save">
          <button type="button">S</button>
        </Tooltip>,
      ),
    );
    expect(container.innerHTML).toBe('<button type="button">S</button>');
    expect(popup()).toBeNull();
  });

  it("opens after the pointer rests 400 ms, and not when it leaves first", async () => {
    vi.useFakeTimers();
    act(() =>
      root.render(
        <Tooltip content="Save">
          <button type="button">S</button>
        </Tooltip>,
      ),
    );
    pointer(button(), "pointerenter");
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(document.body.textContent).not.toContain("Save");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(document.body.textContent).toContain("Save");

    act(() => root.render(<span />));
    act(() =>
      root.render(
        <Tooltip content="Open">
          <button type="button">O</button>
        </Tooltip>,
      ),
    );
    pointer(button(), "pointerenter");
    act(() => {
      vi.advanceTimersByTime(150);
    });
    pointer(button(), "pointerleave");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(document.body.textContent).not.toContain("Open");
  });

  it("ignores a touch's pointer", () => {
    act(() =>
      root.render(
        <Tooltip content="Save">
          <button type="button">S</button>
        </Tooltip>,
      ),
    );
    pointer(button(), "pointerenter", "touch");
    expect(container.innerHTML).toBe('<button type="button">S</button>');
  });

  it("opens for keyboard focus and closes on blur, Escape and a press, keeping focus where it is", () => {
    act(() =>
      root.render(
        <>
          <Tooltip content="Save">
            <button type="button">S</button>
          </Tooltip>
          <input aria-label="elsewhere" />
        </>,
      ),
    );
    const save = button();
    act(() => save.focus());
    expect(document.activeElement).toBe(save);
    expect(document.body.textContent).toContain("Save");
    act(() => {
      save.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.body.textContent).not.toContain("Save");
    expect(document.activeElement).toBe(save);

    act(() => save.blur());
    act(() => save.focus());
    expect(document.body.textContent).toContain("Save");
    act(() => (container.querySelector("input") as HTMLInputElement).focus());
    expect(document.body.textContent).not.toContain("Save");

    act(() => save.focus());
    act(() => {
      const down = new MouseEvent("pointerdown", { bubbles: true });
      Object.defineProperty(down, "pointerType", { value: "mouse" });
      save.dispatchEvent(down);
    });
    expect(document.body.textContent).not.toContain("Save");
  });

  it("keeps the child itself: a controlled toggle's state, its own ref and its click", () => {
    vi.useFakeTimers();
    const ref = createRef<HTMLButtonElement>();
    const clicks: boolean[] = [];
    function Demo() {
      const [on, setOn] = useState(true);
      return (
        <Tooltip content="Bold">
          <Toggle
            ref={ref}
            aria-label="Bold"
            pressed={on}
            onPressedChange={(next) => {
              clicks.push(next);
              setOn(next);
            }}
          >
            B
          </Toggle>
        </Tooltip>
      );
    }
    act(() => root.render(<Demo />));
    const before = button();
    pointer(before, "pointerenter");
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(document.body.textContent).toContain("Bold");
    expect(button()).toBe(before);
    expect(ref.current).toBe(before);
    expect(before.getAttribute("aria-pressed")).toBe("true");
    act(() => before.click());
    expect(clicks).toEqual([false]);
    expect(before.getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves a radio group's arrow keys choosing and moving focus", async () => {
    function Demo() {
      const [v, setV] = useState("a");
      return (
        <RadioGroup aria-label="Tool" value={v} onValueChange={setV}>
          {["a", "b", "c"].map((x) => (
            <Tooltip key={x} content={x.toUpperCase()}>
              <Radio value={x}>{x}</Radio>
            </Tooltip>
          ))}
        </RadioGroup>
      );
    }
    act(() => root.render(<Demo />));
    const radios = () => [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
    const key = (k: string) =>
      act(async () => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
        );
        await new Promise((r) => setTimeout(r, 20));
      });
    act(() => radios()[0]?.focus());
    expect(document.activeElement).toBe(radios()[0]);
    await key("ArrowRight");
    expect(radios()[1]?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios()[1]);
    await key("ArrowRight");
    expect(radios()[2]?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios()[2]);
    await key("ArrowLeft");
    expect(radios()[1]?.getAttribute("aria-checked")).toBe("true");
    expect(radios().filter((r) => r.tabIndex === 0)).toEqual([radios()[1]]);
  });

  it("wraps a child that is not an element in a focusable trigger, as before", () => {
    act(() => root.render(<Tooltip content="Hint">plain text</Tooltip>));
    expect(button()?.textContent).toBe("plain text");
  });
});
