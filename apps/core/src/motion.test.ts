/// <reference types="node" />
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * The desktop and its add-ons hold still under reduced motion: every
 * `animate-*` class is behind `motion-safe:` (2026-11-19). The kit has its own
 * scan, including transitions, in `packages/ui/src/motion.test.ts`.
 */

const APPS = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ANIMATION = /(?<![\w:-])((?:[\w[\]=-]+:)*)(animate-[a-z-]+)(?![\w-])/g;

function unguarded(text: string): string[] {
  return [...code(text).matchAll(ANIMATION)]
    .filter(([, variants]) => !variants.split(":").includes("motion-safe"))
    .map(([whole]) => whole);
}

describe("motion in the desktop and its add-ons", () => {
  it("finds an animation that is not behind motion-safe:", () => {
    expect(unguarded('cn(loading && "animate-spin", "hover:animate-pulse")')).toEqual([
      "animate-spin",
      "hover:animate-pulse",
    ]);
    expect(unguarded('"motion-safe:animate-spin motion-safe:hover:animate-pulse"')).toEqual([]);
    expect(unguarded("// an animate-spin in prose")).toEqual([]);
  });

  it("puts every animation in core and the add-ons behind motion-safe:", () => {
    const roots = [
      join(APPS, "core", "src"),
      ...readdirSync(join(APPS, "add-ons")).map((name) => join(APPS, "add-ons", name, "src")),
    ];
    const found = roots
      .filter((root) => {
        try {
          return readdirSync(root).length > 0;
        } catch {
          return false;
        }
      })
      .flatMap((root) => sources(root))
      .flatMap((file) => unguarded(readFileSync(file, "utf8")).map((cls) => `${relative(APPS, file)}: ${cls}`));
    expect(found).toEqual([]);
  });
});
