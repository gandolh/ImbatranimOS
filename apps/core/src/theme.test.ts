/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

/**
 * The shared kit moved the desktop's `@theme` block out of `index.css` into the
 * kit (`packages/ui/src/theme.css`), so a marketplace kit app builds against
 * the same token names. No value was to change. `BEFORE` is the block as it
 * stood in `index.css` before the move, token for token, apart from the
 * changes noted on their entries.
 *
 * The one intended difference is `@theme static`: every token is emitted as a
 * CSS variable even when no desktop class uses it, because a kit app's
 * stylesheet may. Comparing the whole built CSS before and after the move
 * showed exactly that: the same rules, the same values, and the previously
 * unused tokens of this block added to the theme layer.
 */
const BEFORE: [string, string][] = [
  ["--color-surface", "var(--k-surface)"],
  ["--color-surface-dim", "var(--k-surface-dim)"],
  ["--color-surface-bright", "var(--k-surface-bright)"],
  ["--color-surface-container-lowest", "var(--k-surface-container-lowest)"],
  ["--color-surface-container-low", "var(--k-surface-container-low)"],
  ["--color-surface-container", "var(--k-surface-container)"],
  ["--color-surface-container-high", "var(--k-surface-container-high)"],
  ["--color-surface-container-highest", "var(--k-surface-container-highest)"],
  ["--color-on-surface", "var(--k-on-surface)"],
  ["--color-on-surface-variant", "var(--k-on-surface-variant)"],
  ["--color-inverse-surface", "var(--k-inverse-surface)"],
  ["--color-inverse-on-surface", "var(--k-inverse-on-surface)"],
  ["--color-outline", "var(--k-outline)"],
  ["--color-outline-variant", "var(--k-outline-variant)"],
  ["--color-background", "var(--k-surface)"],
  ["--color-on-background", "var(--k-on-surface)"],
  ["--color-surface-variant", "var(--k-surface-container-high)"],
  // Added 2026-11-13 for imbatranim-apps: the desk under a page, slide or
  // sheet, one step below the panels in both modes.
  ["--color-desk", "var(--k-desk)"],
  ["--color-surface-tint", "var(--accent)"],
  ["--color-primary", "var(--accent)"],
  ["--color-on-primary", "var(--accent-on)"],
  // The one change since the move (2026-11-03): the container pair maps to the
  // soft accent, the pastel with dark text on it in Apricot. Classic sets the
  // soft pair equal to the strong one, so there it resolves as before.
  ["--color-primary-container", "var(--accent-soft)"],
  ["--color-on-primary-container", "var(--accent-soft-on)"],
  ["--color-inverse-primary", "var(--accent)"],
  ["--color-heritage", "var(--accent)"],
  ["--color-secondary", "var(--k-on-surface-variant)"],
  ["--color-on-secondary", "var(--k-surface)"],
  ["--color-secondary-container", "var(--k-surface-container-high)"],
  ["--color-on-secondary-container", "var(--k-on-surface)"],
  ["--color-tertiary", "var(--k-on-surface-variant)"],
  ["--color-on-tertiary", "var(--k-surface)"],
  ["--color-tertiary-container", "var(--k-surface-container-high)"],
  ["--color-on-tertiary-container", "var(--k-on-surface)"],
  ["--color-error", "var(--k-error)"],
  // 2026-11-13: on-error follows the mode (white on the light red, a dark ink
  // on the dark one, where white was 2.7:1); it was a literal white.
  ["--color-on-error", "var(--k-on-error)"],
  ["--color-error-container", "var(--k-error-container)"],
  ["--color-on-error-container", "var(--k-on-error-container)"],
  // Since 2026-11-03 the UI font follows the theme: index.css sets --k-font-ui
  // per token block, Figtree in Apricot and Space Grotesk in Classic.
  ["--font-ui", "var(--k-font-ui)"],
  // Added 2026-11-13: the display face, Solway in Apricot and Space Grotesk in
  // Classic, for the wordmark, Start's letter heads and page titles.
  ["--font-display", "var(--k-font-display)"],
  ["--font-content", '"Inter", ui-sans-serif, system-ui, sans-serif'],
  // The corner radii (2026-11-03): per theme, 0px in Classic.
  ["--radius-window", "var(--k-radius-window)"],
  ["--radius-menu", "var(--k-radius-menu)"],
  ["--radius-control", "var(--k-radius-control)"],
  ["--radius-item", "var(--k-radius-item)"],
  ["--radius-tile", "var(--k-radius-tile)"],
  ["--radius-small", "var(--k-radius-small)"],
  // Added by brief 87 (2026-11-12): the dialog scrim (was bg-black/50) and the
  // z scale (was fifteen literal z-[N] values, in the same order).
  ["--color-scrim", "#00000080"],
  ["--z-index-palette-scrim", "900"],
  ["--z-index-palette", "901"],
  ["--z-index-popover", "1000"],
  ["--z-index-scrim", "1000"],
  ["--z-index-dialog", "1001"],
  ["--z-index-select", "1002"],
  ["--z-index-tooltip", "1100"],
  ["--z-index-toast", "8500"],
  ["--z-index-taskbar", "9000"],
  ["--z-index-start", "9001"],
  ["--z-index-lock", "9999"],
  ["--z-index-menu", "10000"],
  ["--z-index-switcher", "10001"],
  // Added by brief 87 (2026-11-12): the type scale, each size the pixel value
  // the app drew before (note, prose, heading and headline carry the line
  // height of the Tailwind size they replaced), and one spacing step at 13/16
  // of Tailwind's, since the 13 px moved from the root onto body.
  ["--text-nano", "8px"],
  ["--text-micro", "9px"],
  ["--text-tiny", "10px"],
  // 2026-11-13: the sizes the shell draws carry their line height, and index
  // (16/20) is new, for Start's letter heads.
  ["--text-label", "11px"],
  ["--text-label--line-height", "15px"],
  ["--text-control", "12px"],
  ["--text-control--line-height", "16px"],
  ["--text-body", "13px"],
  ["--text-body--line-height", "18px"],
  ["--text-subhead", "14px"],
  ["--text-lead", "15px"],
  ["--text-lead--line-height", "18px"],
  ["--text-index", "16px"],
  ["--text-index--line-height", "20px"],
  ["--text-title", "17px"],
  ["--text-title--line-height", "22px"],
  ["--text-display-sm", "26px"],
  ["--text-display", "32px"],
  ["--text-display-lg", "36px"],
  ["--text-display-xl", "40px"],
  ["--text-note", "11.375px"],
  ["--text-note--line-height", "calc(1.25 / 0.875)"],
  ["--text-prose", "13px"],
  ["--text-prose--line-height", "1.5"],
  ["--text-heading", "19.5px"],
  ["--text-heading--line-height", "calc(2 / 1.5)"],
  // 2026-11-13: page titles at 24/30 (was 24.375 px at 1.2).
  ["--text-headline", "24px"],
  ["--text-headline--line-height", "30px"],
  ["--spacing", "0.203125rem"],
  ["--spacing-half", "4px"],
  ["--spacing-base", "8px"],
  ["--spacing-double", "16px"],
  ["--spacing-window-padding", "12px"],
  ["--spacing-container-gap", "8px"],
  // Added 2026-11-13: imbatranim-apps' panel widths and bar heights.
  ["--container-navigator", "132px"],
  ["--container-navigator-max", "220px"],
  ["--container-inspector", "272px"],
  ["--container-inspector-strip", "48px"],
  ["--container-annotate", "232px"],
  ["--container-pdf-strip", "56px"],
  ["--container-popover", "264px"],
  ["--container-pdf-navigator", "200px"],
  ["--spacing-appbar", "40px"],
  ["--spacing-appbar-phone", "48px"],
  ["--spacing-statusbar", "32px"],
  ["--spacing-statusbar-phone", "48px"],
  ["--spacing-bottombar", "56px"],
  ["--spacing-target", "44px"],
];

const SRC = __dirname;
const indexCss = readFileSync(join(SRC, "index.css"), "utf8");
const themeCss = readFileSync(join(SRC, "../../../packages/ui/src/theme.css"), "utf8");

/** Every `--name: value;` declaration in `css`, comments dropped, in order. */
function declarations(css: string): [string, string][] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()] as [string, string]);
}

describe("the theme tokens moved into the kit", () => {
  it("index.css imports the kit theme and declares no @theme of its own", () => {
    expect(indexCss).toContain('@import "../../../packages/ui/src/theme.css";');
    expect(indexCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/@theme\b/);
  });

  it("holds exactly the tokens index.css had, with the same values, in one static block", () => {
    expect(themeCss.match(/@theme\b[^{]*\{/g)).toEqual(["@theme static {"]);
    expect(declarations(themeCss)).toEqual(BEFORE);
  });

  it("emits every token as a CSS variable even when no class uses it", async () => {
    const compiler = await compile(`${themeCss}\n@tailwind utilities;`);
    const built = declarations(compiler.build([]));
    expect(built).toEqual(BEFORE);
  });

  it("resolves a kit app's utility to the desktop's variable", async () => {
    const compiler = await compile(`${themeCss}\n@tailwind utilities;`);
    // Joined, not written out: the desktop's Tailwind scans this directory,
    // and a literal class name here would put that utility in its CSS.
    const css = compiler.build([
      ["bg", "surface-tint"].join("-"),
      ["text", "on-tertiary-container"].join("-"),
      ["p", "window-padding"].join("-"),
    ]);
    expect(css).toContain("background-color: var(--color-surface-tint)");
    expect(css).toContain("color: var(--color-on-tertiary-container)");
    expect(css).toContain("padding: var(--spacing-window-padding)");
  });
});
