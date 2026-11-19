// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScrollArea } from "./ScrollArea";

/** jsdom has no layout, so these hold the classes and inline min-width the content ends up with. */
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

const contentEl = () => {
  const child = container.querySelector("[data-testid=row]");
  return child?.parentElement;
};

describe("ScrollArea content width", () => {
  it("a vertical scroll area's content has a min-width of 0", () => {
    act(() =>
      root.render(
        <ScrollArea>
          <span data-testid="row">x</span>
        </ScrollArea>,
      ),
    );
    // Base UI's inline min-width: fit-content only loses to an important utility.
    expect(contentEl()?.className).toContain("min-w-0!");
  });

  it.each(["horizontal", "both"] as const)("a %s scroll area keeps fit-content", (orientation) => {
    act(() =>
      root.render(
        <ScrollArea orientation={orientation}>
          <span data-testid="row">x</span>
        </ScrollArea>,
      ),
    );
    expect(contentEl()?.className).not.toContain("min-w-0");
    expect(contentEl()?.style.minWidth).toBe("fit-content");
  });
});
