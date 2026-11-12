/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

const THEME = readFileSync(join(__dirname, "theme.css"), "utf8");
const SCALE = [...THEME.matchAll(/--text-([a-z-]+?):\s*[\d.]+px;/g)].map((m) => m[1]);

describe("cn and the type scale", () => {
  it("finds the named sizes in theme.css", () => {
    expect(SCALE).toContain("label");
    expect(SCALE).toContain("control");
    expect(SCALE).toContain("body");
  });

  it.each(SCALE)("keeps text-%s next to a text colour", (name) => {
    expect(cn("text-on-surface", `text-${name}`)).toBe(`text-on-surface text-${name}`);
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-label", "text-control")).toBe("text-control");
  });

  it("sets one spacing step to 13/16 of Tailwind's, so the 13 px root keeps every utility's pixels", () => {
    expect(THEME).toMatch(/--spacing:\s*0\.203125rem;/);
  });
});
