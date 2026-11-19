// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

/**
 * The kit context menu's ARIA contract — the part all three
 * migrated call sites inherit and none of the hand-rolled copies had.
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
  document.body.innerHTML = "";
});

const render = (items: ContextMenuItem[], onClose = () => {}) =>
  act(() => root.render(<ContextMenu x={40} y={40} items={items} onClose={onClose} label="Test menu" />));

describe("ContextMenu (kit)", () => {
  it("renders role=menu with menuitem children and the accessible name", () => {
    render([
      { label: "Open", onSelect: () => {} },
      { label: "Delete", onSelect: () => {}, danger: true },
    ]);
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute("aria-label")).toBe("Test menu");
    const items = document.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect([...items].map((i) => i.textContent)).toEqual(["Open", "Delete"]);
  });

  it("a separator renders role=separator", () => {
    render([{ label: "A", onSelect: () => {} }, { type: "separator" }, { label: "B", onSelect: () => {} }]);
    expect(document.querySelector('[role="separator"]')).not.toBeNull();
  });

  it("a disabled item carries aria-disabled and does not fire", () => {
    const onSelect = vi.fn();
    render([{ label: "Paste", onSelect, disabled: true }]);
    const item = document.querySelector('[role="menuitem"]')!;
    expect(item.getAttribute("aria-disabled")).toBe("true");
    act(() => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("checked renders a menuitemcheckbox with aria-checked", () => {
    render([
      { label: "Clock widget", onSelect: () => {}, checked: true },
      { label: "Notes widget", onSelect: () => {}, checked: false },
    ]);
    const boxes = document.querySelectorAll('[role="menuitemcheckbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].getAttribute("aria-checked")).toBe("true");
    expect(boxes[1].getAttribute("aria-checked")).toBe("false");
  });

  it("activating a checkbox item fires onSelect (the desktop widget toggle)", () => {
    const onSelect = vi.fn();
    render([{ label: "Clock widget", onSelect, checked: false }]);
    const box = document.querySelector('[role="menuitemcheckbox"]')!;
    act(() => {
      box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("a custom row renders its children verbatim", () => {
    render([
      { type: "custom", key: "grid", children: <div data-testid="workspace-grid">1234</div> },
      { label: "Close", onSelect: () => {}, danger: true },
    ]);
    expect(document.querySelector('[data-testid="workspace-grid"]')?.textContent).toBe("1234");
  });

  it("activating an item fires onSelect", () => {
    const onSelect = vi.fn();
    render([{ label: "Open", onSelect }]);
    const item = document.querySelector('[role="menuitem"]')!;
    act(() => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("every row is a 44 px target under 600 px and compact above it", () => {
    render([
      { label: "Open", onSelect: () => {} },
      { label: "Paste", onSelect: () => {}, disabled: true },
      { label: "Clock widget", onSelect: () => {}, checked: true },
      { label: "Delete", onSelect: () => {}, danger: true },
    ]);
    const rows = document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]');
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const classes = (row.getAttribute("class") ?? "").split(/\s+/);
      // `target` is 44 px in the kit's theme.css; the desktop's row keeps its padding.
      expect(classes).toContain("max-[600px]:min-h-target");
      expect(classes).toContain("py-1");
      expect(classes.filter((c) => /^(h|min-h)-/.test(c))).toEqual([]);
    }
  });

  it("any scroll closes the menu", () => {
    const onClose = vi.fn();
    render([{ label: "Open", onSelect: () => {} }], onClose);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("a popup scrolls inside the space left, and rows keep their 44 px floor", () => {
    render([{ label: "A", onSelect: () => {} }]);
    const popup = document.querySelector('[role="menu"]')!;
    expect(popup.className).toContain("max-h-(--available-height)");
    expect(popup.className).toContain("overflow-y-auto");
    expect(document.querySelector('[role="menuitem"]')!.className).toContain("max-[600px]:min-h-target");
  });

  it("closeOnClick false keeps the menu open after the row is chosen; the default closes it", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      [
        { label: "Stay", onSelect, closeOnClick: false },
        { label: "Go", onSelect: () => {} },
      ],
      onClose,
    );
    const rows = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
    act(() => rows[0].click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    act(() => rows[1].click());
    expect(onClose).toHaveBeenCalled();
  });
});
