// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "./Button";
import { Input } from "./Input";
import { ScrollArea } from "./ScrollArea";

/**
 * jsdom has no stylesheet, so these hold the classes a keyboard focus draws:
 * the token ring, 2 px, in the accent. The walk in the desktop checks the
 * painted ring.
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

const classes = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

describe("focus rings (kit)", () => {
  it.each(["default", "primary", "selected", "ghost", "destructive"] as const)(
    "a %s Button rings on keyboard focus",
    (variant) => {
      act(() => root.render(<Button variant={variant}>Go</Button>));
      const button = container.querySelector("button");
      act(() => button?.focus());
      expect(document.activeElement).toBe(button);
      expect(classes(button)).toContain("focus-visible:ring-2");
      expect(classes(button).some((c) => /^focus-visible:ring-(primary|error)$/.test(c))).toBe(true);
    },
  );

  it("a bare Input, with no Field around it, rings on its own focus at full strength", () => {
    act(() => root.render(<Input aria-label="Name" />));
    const input = container.querySelector("input");
    act(() => input?.focus());
    expect(document.activeElement).toBe(input);
    const c = classes(input);
    expect(c).toContain("focus-visible:ring-2");
    expect(c).toContain("focus-visible:ring-primary");
    expect(c).toContain("focus-visible:border-primary");
    expect(c.filter((x) => x.startsWith("data-[focused]") || x.includes("ring-primary/"))).toEqual([]);
  });

  it("a ScrollArea's viewport rings through a layer above its content", () => {
    act(() =>
      root.render(
        <ScrollArea className="h-20">
          <p>Rows</p>
        </ScrollArea>,
      ),
    );
    const scrollRoot = container.firstElementChild;
    const viewport = scrollRoot?.firstElementChild;
    expect(classes(viewport)).toContain("peer");
    // The ring layer comes after the viewport, so it paints above the rows.
    const ring = scrollRoot?.lastElementChild;
    expect(ring).not.toBe(viewport);
    expect(ring?.getAttribute("aria-hidden")).toBe("true");
    const c = classes(ring);
    expect(c).toContain("peer-focus-visible:ring-2");
    expect(c).toContain("peer-focus-visible:ring-primary");
    expect(c).toContain("pointer-events-none");
    expect(c).toContain("absolute");
  });
});
