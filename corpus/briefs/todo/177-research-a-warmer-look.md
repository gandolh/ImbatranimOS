# Brief 177 — Research a warmer, softer look

## Context

The owner, 2026-10-27: they like how minimal the desktop is, but want something friendlier:
pastel colours, a cute background, maybe an Aero effect. "Something warm, calm and chill."
Research only, not grilled yet; nothing ships from this brief.

**This revisits a locked call.** The identity in
[decisions-iso-era.md](../../wiki/decisions-iso-era.md) is a Windows-7-classic layout rendered
"modern flat, classy black & white with parameterized accent colors", and
[decisions.md](../../wiki/decisions.md) confirmed crimson as the default accent on 2026-07-19.
[ui-conventions.md](../../wiki/ui-conventions.md) adds dark-first and zero border radius. The
colours, the background, the radius and the glass are open now. **The layout is not**: taskbar,
Start button and menu, tray and desktop icons stay where they are. The owner has twice preferred a
familiar UI over a striking one that changed how things are found (showcase, Shelfmark); a warmer
skin on the same layout is the brief.

What the look is made of today:

- **Tokens:** `packages/ui/src/theme.css`, `@theme static`, pinned by
  `apps/core/src/theme.test.ts` ([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md)).
  Every add-on, marketplace kit app and imbatranim-office app compiles against these tokens, so
  a palette change reaches all of them.
- **Light and dark:** dark is the default, light is the same token names under
  `:root[data-theme='light']` (`apps/core/src/index.css`).
- **Accent:** one CSS variable and four presets, `ACCENT_PRESETS` in
  `apps/core/src/shared/store/appearanceStore.ts`.
- **Wallpaper:** three patterns (`dots`, `grid`, `linen`) in
  `apps/core/src/shared/store/wallpaperStore.ts`, saved to the account's prefs.
- **Fonts:** Space Grotesk for the UI, Inter for content.

## Spec

1. **References.** Collect six to ten desktops and apps that are warm and calm: Windows 7 Aero
   and Vista, macOS's translucent sidebars, a few pastel desktop themes, cosy apps and games with
   soft palettes. For each, note what makes it calm (palette, contrast, radius, glass, wallpaper,
   type) in a sentence. Screenshots in a scratch folder, not in the repo.
2. **Three directions** on the same layout. Each one gives:
   - a palette for light and dark: background, surfaces, text, borders and four or five pastel
     accents to replace the presets; every text pair checked against WCAG AA;
   - a wallpaper: one or two illustrated or gradient backgrounds, with where they come from and
     their licence (or made by us, as SVG or CSS);
   - the radius, shadow and border values;
   - glass: where `backdrop-filter: blur()` goes (taskbar, Start menu, window title bars), and the
     flat fallback.
   Lean to light, since the owner has picked light in other apps, but give each direction both
   themes.
3. **Render them.** Mock the desktop with two windows open, the Start menu and the taskbar, in
   each direction, light and dark, side by side on one HTML page. Use the real token names, so a
   direction can later be applied by swapping values.
4. **Measure the glass.** "Lightweight is identity" and a snappy desktop are invariants. In the dev
   container, with three windows open, compare frame time while dragging a window and opening the
   Start menu, glass on and off, in Chrome and Firefox. Note a low-end case (Chrome's CPU
   throttling) and whether the glass should be a Settings toggle.
5. **Write the revisit up.** A findings page `wiki/look-research-2026-10.md` with the references,
   the three directions, the numbers from step 4 and a recommendation. It also lists what each
   direction would change: token values, the accent presets, new wallpapers, the radius rule in
   `ui-conventions.md`, `theme.test.ts`, and the kit apps and imbatranim-office apps to re-check.

## Must preserve

- The Windows-7-classic layout and every way of finding things.
- Token names. A direction changes values, not names, so add-ons and kit apps keep compiling.
- The accessibility floor in `ui-conventions.md`.

## Acceptance

- The findings page exists, with the HTML mock page linked from it (kept in
  `corpus/wiki/assets/` or a scratch path named in the page).
- Each direction has light and dark, contrast checked, and a wallpaper with its source.
- The glass numbers are from real runs, with the browser and machine named.
- No change to `packages/`, `apps/` or the decisions pages. Recording the new identity is the
  grill's job, once the owner picks.

## Files you OWN

- `corpus/wiki/look-research-2026-10.md` and its mock page.
- `corpus/wiki/status.md`, `corpus/log.md`.

## Files you must NOT touch

- `packages/ui/src/theme.css`, `apps/core/src/index.css`, the stores and `theme.test.ts`.
- `corpus/wiki/decisions*.md`.

## Where the 2026-10-28 run stopped

Stopped after reading, when the run's session ran out. Nothing collected, rendered or measured yet;
no findings page, no mock page. What the reading confirmed, for the next run:

- The radius rule is `* { border-radius: 0 !important }` in `apps/core/src/index.css`, so a
  direction with radius changes that line, not only `ui-conventions.md`.
- The three wallpapers are CSS gradients in `WALLPAPER_STYLES`
  (`apps/core/src/shared/components/desktop/Desktop.tsx`); `wallpaperStore.ts` holds only the id.
- The chrome a glass direction would touch: the taskbar's `bg-surface-container-low`
  (`taskbar/Taskbar.tsx`), the Start menu's `bg-surface-container-low` and its
  `shadow-[0_-8px_32px_rgba(0,0,0,0.45)]` (`taskbar/StartMenu.tsx`), and the title bar's
  `bg-surface-container-high`/`bg-surface-container` (`window/Window.tsx`).
- The `os-run-dev` container (exited) is there to reuse for step 4.
