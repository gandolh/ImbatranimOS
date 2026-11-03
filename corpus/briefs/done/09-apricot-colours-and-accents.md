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

## Outcome (2026-11-03)

**Built in `b35e1b8` (version 1.72.0).**

`index.css` has four token blocks:
- `:root, :root[data-os-theme='apricot'][data-theme='light']`;
- Apricot dark;
- Classic dark;
- Classic light.

The bare `:root` accent defaults are Apricot light's. `AccentPreset` is now
`{ id, name, light, dark }`, each mode an `AccentColours` of `{ strong,
strongOn, soft, softOn }`. `accentColours(state)` returns the current one,
and `applyAppearance` stamps `--accent`, `--accent-on`, `--accent-soft` and
`--accent-soft-on`. `theme.css` maps `primary-container` /
`on-primary-container` to the soft pair.

**The hexes chosen.** Apricot light: strong with `#ffffff` on it, soft with
`#33241b` on it. Apricot dark: strong and soft are both the pastel with
`#33241b` on it. Classic: all four slots are the preset with `#ffffff`, in
both modes.

| Preset | Apricot light strong | Soft (both modes), dark strong |
|---|---|---|
| Apricot | `#a04b23` | `#f2a97e` |
| Rose | `#b23656` | `#eea6b5` |
| Butter | `#7f5f1b` | `#f3d27a` |
| Sage | `#4e6c48` | `#a9c9a4` |
| Sky | `#376891` | `#a7c7e7` |

Classic is unchanged: Crimson `#c0263a`, Cobalt `#1f5fd6`, Emerald `#0f7a40`,
Signal Orange `#d24317`.

How the deep shades were made: each keeps its pastel's hue, shifted as the
canvas's `#a84f25` is from Apricot (about 3°). The saturation is scaled the
same way. Each takes the highest lightness that clears 4.6:1 as text on
`surface` through `surface-container-high` and under white.

**Three canvas values failed the contrast test and were moved just enough,**
same hue:
- The deep apricot `#a84f25` is 4.31:1 on `high` (`#f0e1d2`), so it became
  `#a04b23` (4.65).
- Apricot light's `onVar` `#7a5f4e` is 4.16:1 on `highest`, so it became
  `#735949` (4.57).
- Apricot dark's error `#ff6b6b` is 4.41:1 on `highest`, so it became
  `#ff7171` (4.58).

Apricot light's error `#ba1a1a` passes (4.58 on `highest`) and is kept.

Derived tokens:
- Apricot light: `surface-dim` `#e9d6c4` (beside `highest`, as Classic
  light's is), `surface-bright` `#fffdf9`, inverse `#3a2a20` / `#fbf3ea`.
- Apricot dark: `dim` `#181310`, `bright` `#2e2622`, inverse `#f6eadf` /
  `#231d1a`.

**Checked:**
- `contrast.test.ts` (new, 32 tests) covers every Apricot surface token in
  both modes:
  - `on` and `onVar` on each surface;
  - each preset's strong as text on `surface` through `high`;
  - `strongOn` on strong and `softOn` on soft;
  - Classic's white on each fill, with its soft pair equal to its strong one.
- `theme.test.ts` (the two container entries changed, with a comment), the
  store tests, the marketplace tests, typecheck and lint pass.
- Screenshots: Classic light and dark windows are the same as before brief 08
  (0 pixels). On the desktop only the tray's live stats moved, shifting the
  workspace buttons.
- Apricot light and dark show the canvas's cream and dusk surfaces on the
  desktop, the Start menu, Settings and File Manager. Corners are still
  square, and selected things still use the deep fill until 10.
- A fresh profile's sign-in screen paints cream (`rgb(251, 243, 234)`).

**A miss in 08:** its outcome said typecheck passed on the touched files, but
`tsc -b` had run before the store test was written. The test's
write-counting helper was untyped (two implicit `any`), and the commit fixes
it.
