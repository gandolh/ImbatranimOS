// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tab, Tabs, TabsList, TabsPanel } from "./Tabs";
import { Toggle, ToggleGroup } from "./Toggle";

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

const tick = () => new Promise((r) => setTimeout(r, 20));
const key = (el: Element, k: string) =>
  act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    await tick();
  });
const click = (el: Element) =>
  act(async () => {
    (el as HTMLElement).click();
    await tick();
  });

function Days({ keepOne = false }: { keepOne?: boolean }) {
  const [value, setValue] = useState<string[]>(["1"]);
  return (
    <ToggleGroup multiple aria-label="Days" value={value} onValueChange={setValue} keepOne={keepOne}>
      {["0", "1", "2"].map((d) => (
        <Toggle key={d} value={d} aria-label={`Day ${d}`}>
          {d}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

const pressed = () =>
  [...container.querySelectorAll("button")]
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);

describe("Toggle and ToggleGroup (kit)", () => {
  it("lets a multiple group press several at once", async () => {
    act(() => root.render(<Days />));
    const buttons = [...container.querySelectorAll("button")];
    await click(buttons[0]);
    await click(buttons[2]);
    expect(pressed()).toEqual(["0", "1", "2"]);
    await click(buttons[1]);
    expect(pressed()).toEqual(["0", "2"]);
  });

  it("keepOne drops the change that would empty the group", async () => {
    act(() => root.render(<Days keepOne />));
    const buttons = [...container.querySelectorAll("button")];
    await click(buttons[1]);
    expect(pressed()).toEqual(["1"]);
  });

  it("moves focus with the arrow keys without pressing anything", async () => {
    act(() => root.render(<Days />));
    const buttons = [...container.querySelectorAll("button")];
    act(() => buttons[1].focus());
    await key(buttons[1], "ArrowRight");
    expect(document.activeElement).toBe(buttons[2]);
    expect(pressed()).toEqual(["1"]);
  });

  it("a lone Toggle is controlled by pressed", async () => {
    function One() {
      const [on, setOn] = useState(false);
      return (
        <Toggle pressed={on} onPressedChange={setOn}>
          wrap
        </Toggle>
      );
    }
    act(() => root.render(<One />));
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Tabs (kit)", () => {
  function Demo() {
    const [v, setV] = useState("a");
    return (
      <Tabs value={v} onValueChange={(next) => setV(next as string)}>
        <TabsList>
          <Tab value="a">A</Tab>
          <Tab value="b">B</Tab>
          <Tab value="c">C</Tab>
        </TabsList>
        <TabsPanel value="a">panel a</TabsPanel>
        <TabsPanel value="b">panel b</TabsPanel>
        <TabsPanel value="c">panel c</TabsPanel>
      </Tabs>
    );
  }

  it("chooses a tab with the arrow keys and shows only its panel", async () => {
    act(() => root.render(<Demo />));
    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(container.textContent).toContain("panel a");
    expect(container.textContent).not.toContain("panel b");
    act(() => tabs[0].focus());
    await key(tabs[0], "ArrowRight");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("panel b");
    expect(container.textContent).not.toContain("panel a");
    await key(tabs[1], "ArrowRight");
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  });
});
