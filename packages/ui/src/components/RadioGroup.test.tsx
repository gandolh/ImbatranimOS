// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
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
});

function Demo() {
  const [v, setV] = useState("a");
  return (
    <RadioGroup aria-label="Pick" value={v} onValueChange={setV}>
      <Radio value="a">A</Radio>
      <Radio value="b">B</Radio>
      <Radio value="c">C</Radio>
    </RadioGroup>
  );
}

const radios = () => [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
/** An arrow key moves focus, and focus on a radio chooses it a tick later. */
const key = (el: Element, k: string) =>
  act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
  });

describe("RadioGroup (kit)", () => {
  it("chooses with the arrow keys and keeps one option in the Tab order", async () => {
    act(() => root.render(<Demo />));
    const [a, b, c] = radios();
    expect(radios().filter((r) => r.tabIndex === 0)).toEqual([a]);
    act(() => a.focus());
    await key(a, "ArrowRight");
    expect(b.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(b);
    await key(b, "ArrowDown");
    expect(c.getAttribute("aria-checked")).toBe("true");
    await key(c, "ArrowRight");
    expect(a.getAttribute("aria-checked")).toBe("true");
  });
});
