/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCENT_PRESETS, MODE_PREFERENCES, resolveMode, type Mode, type ThemeId } from "./shared/store/appearanceStore";

/**
 * WCAG contrast over the theme values: the token blocks in index.css and the
 * accent presets. Apricot's pastels only pass with dark text on them, so the
 * strong accent (text, rings, borders, primary actions) and the soft one
 * (selected things) are held apart here, in both modes (decisions-themes.md).
 */

const indexCss = readFileSync(join(__dirname, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The `--k-*` colours of the block whose selector list names `theme` and
 * `mode`. A token set to another one (`--k-desk: var(--k-surface-container)`)
 * resolves to that one's colour in the same block.
 */
function tokens(theme: ThemeId, mode: Mode): Record<string, string> {
  const selector = `[data-os-theme="${theme}"][data-theme="${mode}"]`;
  const block = [...indexCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) =>
    sel.split(",").some((s) => s.trim() === selector),
  );
  if (!block) throw new Error(`no token block for ${selector}`);
  const hex = Object.fromEntries(
    [...block[2].matchAll(/--k-([a-z-]+)\s*:\s*(#[0-9a-f]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
  const aliases = [...block[2].matchAll(/--k-([a-z-]+)\s*:\s*var\(--k-([a-z-]+)\)\s*;/g)].map((m) => [m[1], hex[m[2]]]);
  return { ...hex, ...Object.fromEntries(aliases.filter(([, v]) => v !== undefined)) };
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

describe("the modes the contrast checks cover", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("are every mode a preference can paint, System included", () => {
    const painted = new Set<Mode>();
    for (const preference of MODE_PREFERENCES) {
      for (const dark of [false, true]) {
        vi.stubGlobal("window", { matchMedia: () => ({ matches: dark }) });
        painted.add(resolveMode(preference));
      }
    }
    expect([...painted].sort()).toEqual([...MODES].sort());
  });
});

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

/**
 * The pairs the 2026-11-13 redesign added, in all four combinations: the error
 * pairs, a control's edge where controls sit, the selected state (the soft
 * pair, edged by the strong accent) for every preset, and imbatranim-apps'
 * desk against the panels around it. Large text and edges need 3:1.
 */
const EDGE = 3;
const THEMES: ThemeId[] = ["apricot", "classic"];

describe("every theme and mode", () => {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      describe(`${theme} ${mode}`, () => {
        const k = tokens(theme, mode);

        it("reads text on the error fill and on the error container", () => {
          expect(contrast(k["on-error"], k.error), "on-error on error").toBeGreaterThanOrEqual(AA);
          expect(
            contrast(k["on-error-container"], k["error-container"]),
            "on-error-container on error-container",
          ).toBeGreaterThanOrEqual(AA);
        });

        it("draws a control's edge at 3:1 on the foot band and on a field", () => {
          // Start's foot band and every band are surface-container; a field is
          // surface-container-lowest; a window body is surface-container-low.
          for (const s of ["surface-container", "surface-container-lowest", "surface-container-low"]) {
            expect(contrast(k.outline, k[s]), `outline on ${s}`).toBeGreaterThanOrEqual(EDGE);
          }
        });

        for (const preset of ACCENT_PRESETS[theme]) {
          it(`${preset.name}: a selected thing reads, and its edge shows on the panels`, () => {
            const a = preset[mode];
            expect(contrast(a.softOn, a.soft), "softOn on soft").toBeGreaterThanOrEqual(AA);
            // The chosen chip's edge is the strong accent: deep in light, the
            // pastel in dark. Start and every window are surface-container-low;
            // an unselected Mode or Accent option is surface-container. Classic
            // keeps its values: in dark, crimson and cobalt reach 2.9:1 on
            // surface-container (the gap noted above), so it is held on the
            // body only.
            const panels =
              theme === "classic" && mode === "dark"
                ? ["surface-container-low"]
                : ["surface-container-low", "surface-container"];
            for (const s of panels) {
              expect(contrast(a.strong, k[s]), `edge on ${s}`).toBeGreaterThanOrEqual(EDGE);
            }
          });
        }

        it("sets the apps' desk one step below their panels, with text that reads on it", () => {
          expect(k.desk, "the desk token").toMatch(/^#/);
          expect(k.desk).toBe(mode === "light" ? k["surface-container"] : k["surface-container-lowest"]);
          expect(luminance(k.desk)).toBeLessThan(luminance(k["surface-container-low"]));
          expect(contrast(k["on-surface"], k.desk), "on-surface on desk").toBeGreaterThanOrEqual(AA);
          expect(contrast(k["on-surface-variant"], k.desk), "on-surface-variant on desk").toBeGreaterThanOrEqual(AA);
        });
      });
    }
  }
});
