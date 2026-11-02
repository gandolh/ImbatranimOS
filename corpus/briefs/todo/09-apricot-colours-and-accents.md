# Brief 09 — Apricot's colours and accents

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)).
Every value comes from the canvas the owner picked from:
[Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html),
`looks().apricot.light` and `.dark`. Brief 08 put `data-os-theme` and
`data-theme` on `<html>` and per-theme accent presets in the store.

Apricot's accents are pastels. A pastel fill only passes contrast with dark
text on it. As text, a focus ring or a border on cream, it fails (Apricot
`#f2a97e` on `#fbf3ea` is about 1.8:1). Today `primary` carries both jobs:
the codebase has about 84 `bg-primary`, 45 `text-primary`, 49
`border-primary` and 50 `ring-primary` uses.

**The split this brief makes.** Each accent gets two pairs:

- **strong** (`--accent` / `--accent-on`) feeds `primary` / `on-primary`. In
  Apricot light it is a deeper shade of the pastel (Apricot's is `#a84f25`,
  the canvas's `ink`), with white on it. All the text, ring and border uses
  stay readable with no code change.
- **soft** (`--accent-soft` / `--accent-soft-on`) feeds `primary-container` /
  `on-primary-container`: the pastel with dark text on it. Brief 10 moves the
  selection fills onto it.

In Classic both pairs equal today's preset and white, so nothing changes
there. `SystemAppearanceState.accent` carries the strong hex, the readable
one. The Terminal's xterm palette already reads `--accent` from CSS.

Independent of 01-06; ships together with 08-15.

## Spec

1. **Token blocks** in `apps/core/src/index.css`, four of them, keyed on both
   attributes:
   - Apricot light, from the canvas. This block is also the bare `:root`
     default, so the sign-in screen and a machine with nothing saved paint
     Apricot light before the stores hydrate.
   - Apricot dark, from the canvas.
   - Classic dark and Classic light: today's values, moved unchanged.

   Use the canvas's `surface`, `lowest`, `low`, `container`, `high`,
   `highest`, `on`, `onVar`, `outlineVar`, `outline` for the matching `--k-*`
   names. Derive `--k-surface-dim`, `--k-surface-bright` and the inverse pair
   to sit with them. Keep today's error values unless they fail contrast on
   Apricot surfaces. If they fail, warm them just enough to pass.
2. **Accent presets.** `AccentPreset` holds, per mode, `{ strong, strongOn,
   soft, softOn }`.
   - Apricot light: soft is the canvas pastel with `#33241b` on it. Strong is
     a darker shade of the same hue with white on it. Derive one for Rose,
     Butter, Sage and Sky the way `#a84f25` relates to Apricot.
   - Apricot dark: both pairs are the pastel with the dark text, as on the
     canvas.
   - Classic: all four slots are today's hex and white, in both modes.

   `applyAppearance` stamps all four variables.
3. **`packages/ui/src/theme.css`**: `--color-primary-container` maps to
   `var(--accent-soft)` and `--color-on-primary-container` to
   `var(--accent-soft-on)`. Every other mapping and every token name stays.
   Update `apps/core/src/theme.test.ts` for exactly these two entries, with a
   comment on why.
4. **A contrast test** (new, unit level) computing WCAG ratios over the
   preset table and the token blocks. For Apricot, light and dark:
   - `on` and `onVar` on every surface token, at least 4.5:1;
   - strong as text on `surface`, `lowest`, `low`, `container` and `high`, at
     least 4.5:1;
   - `strongOn` on strong, at least 4.5:1;
   - `softOn` on soft, at least 4.5:1.

   For Classic, only `on` on each preset (white on the fill) at least 4.5:1.
   Classic's crimson as text on dark is about 3.3:1 today. That is a known
   gap this brief doesn't touch, so don't assert it.

## Must preserve

- Classic, light and dark, pixel for pixel.
- Token names, so add-ons and kit apps compile. Adding runtime variables is
  fine; renaming a `--color-*` token is not.
- The accessibility floor in [ui-conventions.md](../../wiki/ui-conventions.md).

## Acceptance

- The contrast test passes, and so do typecheck, lint and `theme.test.ts`.
- Back-to-back screenshots: Classic light and dark unchanged. Apricot light
  and dark show the canvas's surfaces on the desktop, Settings, File Manager
  and the Start menu (corners stay square until 12).
- The sign-in screen paints Apricot light on a fresh browser profile.
- Outcome lists the strong and soft hexes chosen per preset.

## Files you OWN

- `apps/core/src/index.css`: the token blocks only (the radius rule is 12's,
  the `@font-face` rules are 11's).
- `packages/ui/src/theme.css`: the two container mappings.
- `apps/core/src/theme.test.ts`, the new contrast test.
- `apps/core/src/shared/store/appearanceStore.ts`: `AccentPreset`, the
  presets and `applyAppearance`.
- `corpus/wiki/status.md`, `corpus/log.md`.
