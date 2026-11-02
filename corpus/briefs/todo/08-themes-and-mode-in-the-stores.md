# Brief 08 — Themes and mode in the stores

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
the desktop has two themes, Apricot (the default) and Classic (today's look),
and light/dark is the *mode* inside a theme
([glossary-themes.md](../../wiki/glossary-themes.md)). A machine with saved
settings moves to Apricot light once.

This brief is the plumbing only: the stores, the attributes on `<html>`, the
one-time move. Nothing looks different yet. Apricot's colours come in 09,
selection fills in 10, the font in 11, corners in 12, wallpapers in 13, the
Settings picker in 14 and the full check in 15. Briefs 08-15 ship together,
because before 09, Apricot draws with Classic's values.

These theme briefs don't depend on 01-06 (the Linux apps layer). They run
before them, since 01-06 wait for a quiet machine.

## Spec

1. **Appearance store** (`apps/core/src/shared/store/appearanceStore.ts`):
   - `ThemeId = 'apricot' | 'classic'` and `Mode = 'light' | 'dark'`. The
     old `ThemeMode` type becomes `Mode`.
   - State: `theme: ThemeId`, `mode: Mode`, `accents: Record<ThemeId, string>`
     (the chosen accent id per theme). Setters `setTheme`, `setMode`, and
     `setAccent`, which sets the accent for the current theme.
   - Defaults: `theme: 'apricot'`, `mode: 'light'`, `accents: { apricot:
     'apricot', classic: 'crimson' }`.
   - Presets per theme: `ACCENT_PRESETS: Record<ThemeId, AccentPreset[]>`.
     Classic keeps today's four exactly. Apricot gets five ids and names
     (apricot "Apricot", rose "Rose", butter "Butter", sage "Sage", sky "Sky")
     with the pastel fills from the canvas
     ([Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html),
     `looks().apricot.accents`) and `on: '#33241b'`. Brief 09 reshapes
     `AccentPreset`; keep the change here to what compiles.
2. **`<html>` attributes.** `applyAppearance` takes the whole state and sets
   `data-os-theme="apricot|classic"` and `data-theme="light|dark"`, plus
   `--accent` and `--accent-on` as today. `data-theme` keeps its name: the
   Terminal's xterm palette, the docs site and the token blocks read it. Its
   four callers change with it: `main.tsx`, `App.tsx`,
   `shared/store/dotfiles.ts`, `system/createSystemHandle.ts`.
3. **The add-on contract doesn't change.** `SystemAppearanceState` in
   `packages/ui/src/system.ts` stays `{ theme: 'dark' | 'light'; accent:
   string }`. Its `theme` is the mode, and `accent` is the current accent's
   hex. `appearanceSnapshot()` maps the new state onto it. Add one sentence
   to the type's doc comment saying `theme` there means the mode.
4. **Wallpaper store** (`wallpaperStore.ts`): `wallpapers: Record<ThemeId,
   string>`, defaults `{ apricot: 'sunset-hills', classic: 'dots' }`.
   `setWallpaper` sets it for the current theme. Classic's ids stay `dots |
   grid | linen`; Apricot's are `sunset-hills | plain | soft-dots`. Until 13
   draws them, `Desktop.tsx` renders an unknown id as a plain
   `var(--k-surface)` background.
5. **The one-time move.** Both stores get `version: 1` and a `migrate`, the
   way `desktopStore.ts` does it (`version` and `migrate`, around lines
   83-90):
   - An appearance blob with no version (`{ theme: 'dark' | 'light', accent }`)
     becomes `{ theme: 'apricot', mode: 'light', accents: { apricot:
     'apricot', classic: <old accent> } }`. The owner's old crimson/cobalt/…
     choice stays as Classic's.
   - A wallpaper blob with no version (`{ wallpaper }`) becomes `{ wallpapers:
     { apricot: 'sunset-hills', classic: <old wallpaper> } }`.
   - A blob already at version 1 is left alone. Nothing saved gets the
     defaults (Apricot light).
   Check how `prefsStorage` rehydrates (localStorage mirror first, then
   `/api/prefs` in `dotfiles.ts`) and make sure the migration runs on both
   paths and writes the new shape back once.
6. **Settings keeps working.** `modules/settings/Settings.tsx`: the
   Light/Dark control now calls `setMode`, and the accent swatches list the
   current theme's presets. There is no theme picker yet (14). Don't restyle
   anything.

## Must preserve

- Classic light and Classic dark look exactly as today, pixel for pixel, with
  `data-os-theme="classic"`.
- The `SystemAppearanceState` shape and `appearance-changed` event, so add-ons
  and kit apps in other repos keep compiling and behaving.
- Token names (`packages/ui/src/theme.css` is untouched here).

## Acceptance

- Unit tests: an old appearance blob migrates once to Apricot light with the
  old accent kept as Classic's; the same for an old wallpaper blob; a
  version-1 blob is unchanged; empty storage gives Apricot light.
- `<html>` carries both attributes after sign-in and after a reload, and
  switching mode in Settings flips `data-theme` only.
- With `data-os-theme="classic"`, screenshots of the desktop, Settings and
  File Manager in light and dark match the pre-change ones.
- Typecheck, lint and the touched packages' tests pass. Don't run the full
  cross-workspace suite.
- Comments say what the code does, not which brief made it.

## Files you OWN

- `apps/core/src/shared/store/appearanceStore.ts`, `wallpaperStore.ts`, and
  their tests (new ones are fine).
- `apps/core/src/main.tsx`, `App.tsx`, `shared/store/dotfiles.ts`,
  `system/createSystemHandle.ts`: the `applyAppearance` calls and
  `appearanceSnapshot` only.
- `apps/core/src/shared/components/desktop/Desktop.tsx`: the unknown-id
  fallback only.
- `apps/core/src/modules/settings/Settings.tsx`: `setMode` and the per-theme
  preset list only.
- `packages/ui/src/system.ts`: the doc comment only.
- `corpus/wiki/status.md`, `corpus/log.md`.

## Files you must NOT touch

- `apps/core/src/index.css`, `packages/ui/src/theme.css`,
  `apps/core/src/theme.test.ts` (09 and 11 own them).
