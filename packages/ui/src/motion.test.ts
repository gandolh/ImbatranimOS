/// <reference types="node" />
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * Under reduced motion the kit holds still: every transition and animation
 * class is behind `motion-safe:` (2026-11-19). `transition-none` turns motion
 * off, so it may stand alone.
 */

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Comments may talk about a transition; only code counts. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Each `transition…` or `animate-…` class with the variants written in front of it. */
const MOTION = /(?<![\w:-])((?:[\w[\]=-]+:)*)(transition(?:-[a-z]+)?|animate-[a-z-]+)(?![\w-])/g;

function unguarded(text: string): string[] {
  return [...code(text).matchAll(MOTION)]
    .filter(([, variants, cls]) => cls !== "transition-none" && !variants.split(":").includes("motion-safe"))
    .map(([whole]) => whole);
}

describe("motion in the kit", () => {
  it("finds a class that is not behind motion-safe:", () => {
    expect(unguarded('cn("transition-colors outline-none", "hover:animate-spin")')).toEqual([
      "transition-colors",
      "hover:animate-spin",
    ]);
    expect(unguarded('"motion-safe:transition-colors transition-none motion-safe:hover:animate-spin"')).toEqual([]);
    expect(unguarded("/* a transition-colors in prose */\n// transition-opacity\nconst onTransitionEnd = 1;")).toEqual(
      [],
    );
  });

  it("puts every transition and animation behind motion-safe:", () => {
    const found = sources(__dirname).flatMap((file) =>
      unguarded(readFileSync(file, "utf8")).map((cls) => `${relative(__dirname, file)}: ${cls}`),
    );
    expect(found).toEqual([]);
  });
});
