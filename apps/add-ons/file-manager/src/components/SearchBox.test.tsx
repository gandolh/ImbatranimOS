// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SearchBox } from "./SearchBox";

/**
 * Under reduced motion the search's busy glyph holds still; it is still the
 * busy glyph, in the accent and named, so the state reads without the spin.
 */
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

const noop = () => undefined;
const render = (searching: boolean) =>
  act(() =>
    root.render(
      <SearchBox
        value="notes"
        onChange={noop}
        rootLabel="Home"
        path="/"
        contentMode={false}
        onToggleContentMode={noop}
        onRun={noop}
        onClear={noop}
        onStepIntoResults={noop}
        searching={searching}
        inputRef={createRef<HTMLInputElement>()}
      />,
    ),
  );

describe("SearchBox's busy state", () => {
  it("spins only under motion-safe:, and names itself while it searches", () => {
    render(true);
    const busy = container.querySelector('[aria-label="Searching"]');
    expect(busy).not.toBeNull();
    const classes = (busy?.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toContain("motion-safe:animate-spin");
    expect(classes).not.toContain("animate-spin");
    expect(classes).toContain("text-primary");
  });

  it("has no busy glyph at rest", () => {
    render(false);
    expect(container.querySelector('[aria-label="Searching"]')).toBeNull();
  });
});
