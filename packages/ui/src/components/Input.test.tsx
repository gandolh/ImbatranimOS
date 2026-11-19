// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Field } from "@base-ui/react/field";
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
  // The mark and the room for it are CSS variants of the input's own state, so
  // one rule serves both signals; jsdom does no CSS, so each signal is checked
  // as the attribute the rule reads, plus the rule on the mark and the input.
  const markClass = () => mark()?.getAttribute("class") ?? "";
  const inputClass = () => container.querySelector("input")?.className ?? "";

  it("renders a mark hidden from the accessibility tree, shown by either signal", () => {
    act(() => root.render(<Input aria-label="Name" />));
    expect(mark()?.getAttribute("aria-hidden")).toBe("true");
    expect(markClass()).toContain("hidden");
    expect(markClass()).toContain("peer-aria-invalid:block");
    expect(markClass()).toContain("peer-data-[invalid]:block");
    expect(inputClass()).toContain("peer");
    expect(inputClass()).toContain("aria-invalid:pe-8");
    expect(inputClass()).toContain("data-[invalid]:pe-8");
  });
  it("aria-invalid sets the attribute the rule reads, and the border follows it", () => {
    act(() => root.render(<Input aria-label="Name" aria-invalid />));
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
    expect(inputClass()).toContain("aria-invalid:border-error");
  });
  it("a Field's invalid sets data-invalid on the input, and the border follows it", () => {
    act(() =>
      root.render(
        <Field.Root invalid>
          <Input aria-label="Name" />
        </Field.Root>,
      ),
    );
    expect(container.querySelector("input")?.hasAttribute("data-invalid")).toBe(true);
    expect(inputClass()).toContain("data-[invalid]:border-error");
  });
  it("a valid field carries neither signal", () => {
    act(() => root.render(<Input aria-label="Name" aria-invalid={false} />));
    const input = container.querySelector("input");
    expect(input?.getAttribute("aria-invalid")).not.toBe("true");
    expect(input?.hasAttribute("data-invalid")).toBe(false);
  });
});
