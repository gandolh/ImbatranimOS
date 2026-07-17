# Task 21 — Snipping Tool: flameshot-style screenshot add-on

> **Outcome (2026-07-17, done):** Landed in commit `acfe862` (+ a
> filename-collision review fix in `b46f64e` — ms suffix). Spike PASSED
> with html-to-image; key finding: xterm v6 here uses the DOM renderer,
> so terminal content captures as real DOM (the canvas concern didn't
> apply). Full flow browser-verified: region + Enter-full-desktop
> capture (taskbar included, overlay + own taskbar button excluded),
> all 5 annotation tools baked into a real PNG saved to
> ~/Pictures/Screenshots via the authed files API, Esc aborts cleanly,
> rasterizer is a 12.4 KB lazy chunk. Scope calls within the brief's
> latitude: tray icon skipped (would need a core Tray surface for a
> redundant trigger; start menu + palette work from the registry),
> PrintScreen keybind skipped (best-effort per brief).

## Context

From todos/screenshot-tool-addon.md, grilled 2026-07-17. A screenshot
tool for the web desktop itself. Locked decisions:

- **Capture = DOM rasterization** (html-to-image/snapdom family), NOT
  `getDisplayMedia` (its browser permission dialog breaks the OS
  illusion and mis-targets surfaces) and NOT server-side rendering
  (violates the slim-image invariant).
- **One flow**: trigger → desktop dims behind a crosshair overlay →
  drag a region / press Enter for full desktop → annotate → exit.
  Per-window capture is "expand later" (windowStore already knows
  every window rect).
- **Annotation kit**: arrow, rectangle, text, pixelate, freehand +
  undo + color swatch. Pixelate is load-bearing (redacting terminal
  output/paths before sharing).
- **Exits**: Save is primary — PNG to `~/Pictures/Screenshots/
  screenshot-YYYY-MM-DD-HHMMSS.png` via the files API; Copy button
  (`navigator.clipboard`, gracefully disabled outside secure
  contexts); Download to host.
- Name: **Snipping Tool** (Win7-era name, on-soul).

Post-v1, non-gating; independent of briefs 19–20 and 22.

## Files you OWN

- `apps/add-ons/snipping-tool/` — new package
  `@imbatranim/snipping-tool`, app "Snipping Tool"
- `apps/core/src/manifest.ts` — one new registry line
- Small core tray extension if needed for a tray trigger (own the
  change; keep the add-on→core import direction intact — the tray
  entry must be declared via the manifest/AppConfig surface, not by
  core importing the add-on directly)

## What to do

1. **Spike (gate)**: rasterize the live desktop (terminal open + a few
   windows) with the chosen library in a throwaway harness. Bar:
   output is a faithful, legible PNG of the desktop incl. xterm canvas
   content. If it fails, try the sibling library once; if both fail,
   stop and re-decide (log.md entry).
2. Scaffold the package (notepad pattern; core public surface only).
3. Trigger surfaces: start menu entry + command palette source (both
   exist today); tray icon if the small core extension is reasonable;
   any keybind is best-effort only (PrintScreen delivery to web pages
   is unreliable — do not make it the primary path).
4. Capture flow: on trigger, mount a full-viewport overlay via React
   portal on `document.body` (must cover the taskbar too), hide the
   overlay itself from the rasterized output, dim + crosshair, drag =
   region, Enter/select-all = full desktop, Esc = cancel.
5. Annotation stage on the cropped canvas: the five tools + undo +
   color swatch, minimal Win7-classic toolbar.
6. Exits per the locked decision; Save auto-creates
   `~/Pictures/Screenshots/` (files API upload creates parent dirs).
7. **Lazy-load** the rasterization lib as a dynamic-import chunk.

## Acceptance

Trigger → drag region → arrow + pixelate + freehand annotations →
Save lands a correct PNG in ~/Pictures/Screenshots (visible in Files);
Enter captures the full desktop incl. taskbar; Copy works on
localhost/HTTPS and is visibly disabled otherwise; Esc aborts cleanly;
rasterizer is a lazy chunk; root `turbo` build/typecheck/format:check
green (backend lint debt exempt).
