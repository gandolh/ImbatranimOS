// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Input } from "./Input";

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

const mark = () => container.querySelector("[data-error-mark]");

describe("Input error mark", () => {
  it("shows a mark inside an invalid field, hidden from the accessibility tree", () => {
    act(() => root.render(<Input aria-label="Name" aria-invalid />));
    const m = mark();
    expect(m).not.toBeNull();
    expect(m?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("input")?.className).toContain("pe-8");
  });
  it("shows no mark on a valid field", () => {
    act(() => root.render(<Input aria-label="Name" />));
    expect(mark()).toBeNull();
    expect(container.querySelector("input")?.className).not.toContain("pe-8");
  });
  it("shows no mark when aria-invalid is false", () => {
    act(() => root.render(<Input aria-label="Name" aria-invalid={false} />));
    expect(mark()).toBeNull();
  });
});
