# Brief 11 — Figtree for Apricot

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
Apricot's UI font is Figtree, Classic keeps Space Grotesk, and Inter stays the
content font in both themes.

Fonts are vendored: a latin-subset variable woff2 per family, served from our
own origin. The comment above the `@font-face` rules in
`apps/core/src/index.css` explains why (offline use, no IP leak, CSP
`font-src 'self'`). Nothing records where the two files came from or their
licence.

Independent of 01-06; ships together with 08-15.

## Spec

1. **Vendor Figtree** as `apps/core/src/assets/fonts/figtree-latin-var.woff2`:
   - the same latin subset as the other two;
   - variable on `wght`, covering 400-700;
   - from the Google Fonts / Fontsource release (OFL-1.1).

   No npm dependency. Add its `@font-face` beside the others.
2. **Write down the fonts' provenance:** a short
   `apps/core/src/assets/fonts/README.md` naming each file, its source,
   version and licence (all three are OFL-1.1). Find Space Grotesk's and
   Inter's sources from their files' metadata.
3. **The UI font per theme.** In `packages/ui/src/theme.css`, `--font-ui`
   becomes `var(--k-font-ui)`. Each token block in `index.css` sets
   `--k-font-ui`: Figtree for Apricot, Space Grotesk for Classic, each with
   today's fallback stack. Update `theme.test.ts` for that one entry.
4. **The literals.** These name Space Grotesk directly and must follow the
   theme:
   - `apps/core/src/shared/components/window/Window.tsx` (around line 283);
   - `apps/add-ons/snipping-tool/src/SnippingTool.tsx` (around 192);
   - `components/CaptureOverlay.tsx` (around 85);
   - `components/CountdownOverlay.tsx` (around 25);
   - `components/AnnotationStage.tsx` (around 128, 351, 522).

   Style objects use `var(--font-ui)`. Canvas `ctx.font` strings can't take a
   CSS variable: read
   `getComputedStyle(document.documentElement).getPropertyValue('--font-ui')`
   when drawing.
5. **Check the fit.** Figtree's widths differ from Space Grotesk's. At 13px,
   look at the taskbar buttons, window titles, the Start menu, the Settings
   rail and File Manager's columns in Apricot. Fix clipping, not taste.

## Must preserve

- Classic renders in Space Grotesk exactly as today.
- Inter stays the content font (`font-content`) in both themes.
- The CSP: fonts still load from `'self'` only.

## Acceptance

- In Apricot the chrome renders in Figtree: check it in DevTools' rendered
  fonts. In Classic it renders in Space Grotesk.
- A snipping-tool annotation drawn in Apricot uses Figtree.
- `theme.test.ts`, typecheck and lint pass.
- The fonts README exists. Outcome notes the file size Figtree adds.

## Files you OWN

- `apps/core/src/assets/fonts/` (the new file and the README).
- `apps/core/src/index.css`: the `@font-face` rules and `--k-font-ui` in the
  token blocks.
- `packages/ui/src/theme.css`: `--font-ui`. `apps/core/src/theme.test.ts`:
  that entry.
- The literals listed in step 4.
- `corpus/wiki/status.md`, `corpus/log.md`.
