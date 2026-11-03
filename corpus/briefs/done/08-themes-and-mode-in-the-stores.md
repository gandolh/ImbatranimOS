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

## Outcome (2026-11-03)

**Built in `93604c2` (version 1.70.0), checked against a host run in headless
Chrome.** The appearance store holds `theme` (`apricot | classic`), `mode`
(`light | dark`) and `accents` per theme. The old `ThemeMode` is `Mode`.
`ACCENT_PRESETS` is per theme, with Apricot's five pastels and `#33241b` on
them. The wallpaper store holds `wallpapers` per theme, and
`useCurrentWallpaper()` reads the current theme's. `applyAppearance(state)`
sets `data-os-theme`, `data-theme`, `--accent` and `--accent-on`.

The one-time move: both stores are at `version: 1`. `migrate` and a custom
`merge` both go through `readAppearance` / `readWallpapers`. These read the
pre-theme shape (a `theme` that is a mode, or a flat `wallpaper`) and the
current one, falling back per field. So a blob saved with no `version`
(which persist hands to `merge` without calling `migrate`) moves too. Persist
writes the migrated shape back once, whichever way the old blob arrives: the
localStorage mirror at import, or the server's copy after `hydratePrefs`.
`setAccent` and `setWallpaper` ignore an id that isn't the current theme's.

**A visible change for add-ons and kit apps:** `system.appearance.get().accent`
used to carry the accent's id (`'crimson'`), though the type and the sandbox
tests already described a hex. It now carries the current accent's hex.
Nothing in this repo read the id. A kit app in another repo that compared it
against ids would see the change.

Settings: the Light/Dark control (still labelled "Theme", relabelled by 14)
sets the mode, and the accent swatches list the current theme's presets. The
wallpaper picker still lists Classic's three. In Apricot, picking one does
nothing until 13 brings Apricot's set.

**Checked:**
- Typecheck, lint and prettier pass on the touched files. The new
  `appearanceStore.test.ts` has nine tests: empty storage gives Apricot light
  and writes nothing; an old blob moves once from the mirror and from the
  server's copy; a version-1 blob is left alone; accent and wallpaper are
  set per theme; `applyAppearance` sets both attributes. Also run:
  `prefs.test.ts`, `sandboxBridge.test.ts`, the marketplace host and scope
  tests, and the auth tests.
- In the browser, an old blob (`dark`, `emerald`, `linen`) on the server and
  in the mirror came back after a reload as Apricot light. The server's copy
  was rewritten at version 1 with `classic: 'emerald'` and `classic:
  'linen'`.
- Settings' Dark button changed `data-theme` only.
- A fresh profile's sign-in screen carried `apricot` / `light`.
- Classic light and dark screenshots, before and after, were the same in the
  File Manager and Settings windows (0 pixels). On the desktop and the open
  Start menu, they differed only in the tray's live stats and clock.

**How the screenshots are taken** (09-15 reuse it):
- The backend runs from `npm run build -w apps/backend` and `node dist/main`,
  with `HOME`, `DB_PATH`, `NOTES_DIR` and `CONFIGS_DIR` in a scratch folder.
  The scratch home holds the demo folders, dated 2026-10-09.
- Vite runs from `apps/core`.
- A throwaway owner claims the scratch machine.
- A script writes the two dotfiles through `PUT /api/prefs` and localStorage,
  clears sessionStorage, reloads, and closes windows by `button[title=Close]`.
  It opens desktop icons by `[role=button][aria-label=…]` and Settings from
  Start.
- It shoots the whole screen plus the `[data-app-id]` window elements at
  1280×800. Window elements are compared because each new window opens a
  step further along.
- `compare -metric AE -fuzz 2%`.
