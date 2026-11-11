/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, type Mode, type ThemeId } from "./shared/store/appearanceStore";

/**
 * WCAG contrast over the theme values: the token blocks in index.css and the
 * accent presets. Apricot's pastels only pass with dark text on them, so the
 * strong accent (text, rings, borders, primary actions) and the soft one
 * (selected things) are held apart here, in both modes (decisions-themes.md).
 */

const indexCss = readFileSync(join(__dirname, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The `--k-*` declarations of the block whose selector list names `theme` and `mode`. */
function tokens(theme: ThemeId, mode: Mode): Record<string, string> {
  const selector = `[data-os-theme="${theme}"][data-theme="${mode}"]`;
  const block = [...indexCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) =>
    sel.split(",").some((s) => s.trim() === selector),
  );
  if (!block) throw new Error(`no token block for ${selector}`);
  return Object.fromEntries([...block[2].matchAll(/--k-([a-z-]+)\s*:\s*(#[0-9a-f]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = [
  "surface",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
];

/** Where the strong accent is read as text: every surface a window or menu sits on. */
const ACCENT_TEXT_SURFACES = [
  "surface",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
];

const MODES: Mode[] = ["light", "dark"];
const AA = 4.5;

describe("Apricot", () => {
  for (const mode of MODES) {
    describe(`${mode}`, () => {
      const k = tokens("apricot", mode);

      it("has every surface token", () => {
        for (const s of SURFACES) expect(k[s], s).toMatch(/^#/);
      });

      it("keeps text and secondary text at 4.5:1 on every surface", () => {
        for (const s of SURFACES) {
          expect(contrast(k["on-surface"], k[s]), `on-surface on ${s}`).toBeGreaterThanOrEqual(AA);
          expect(contrast(k["on-surface-variant"], k[s]), `on-surface-variant on ${s}`).toBeGreaterThanOrEqual(AA);
        }
      });

      for (const preset of ACCENT_PRESETS.apricot) {
        const a = preset[mode];

        it(`${preset.name}: strong reads as text on the surfaces`, () => {
          for (const s of ACCENT_TEXT_SURFACES) {
            expect(contrast(a.strong, k[s]), `strong on ${s}`).toBeGreaterThanOrEqual(AA);
          }
        });

        it(`${preset.name}: both pairs read`, () => {
          expect(contrast(a.strongOn, a.strong), "strongOn on strong").toBeGreaterThanOrEqual(AA);
          expect(contrast(a.softOn, a.soft), "softOn on soft").toBeGreaterThanOrEqual(AA);
        });
      }
    });
  }
});

describe("Classic", () => {
  // Crimson as text on the dark surfaces is about 3.3:1, a known gap left as
  // it was; only white on each fill is held here.
  for (const mode of MODES) {
    for (const preset of ACCENT_PRESETS.classic) {
      it(`${mode}: white on ${preset.name}`, () => {
        const a = preset[mode];
        expect(contrast(a.strongOn, a.strong)).toBeGreaterThanOrEqual(AA);
        expect(a.soft).toBe(a.strong);
        expect(a.softOn).toBe(a.strongOn);
      });
    }
  }
});
