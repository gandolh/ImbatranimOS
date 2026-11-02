# Brief 12 — Rounded corners and Apricot's chrome

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
Apricot has soft rounded corners, and Classic stays square. Today
`apps/core/src/index.css` forces `* { border-radius: 0 !important }`, and
[ui-conventions.md](../../wiki/ui-conventions.md) bans `rounded-*` classes as
dead code. Only 15 `rounded` uses are left, in three files: media-player's
`TransportBar.tsx` and calculator's `BasicPad.tsx` and `ScientificPad.tsx`.

The canvas the owner picked
([Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html)) also
gives Apricot a few chrome details beyond corners:
- soft tinted shadows;
- a Start menu floating 8px off the taskbar and the left edge;
- a taskbar with inner padding and pill-shaped Start, Search and task buttons,
  where the current task shows a small centred dot rather than an
  underline;
- no accent border on the focused window;
- desktop icons on a light tile.

The layout and every position stay as they are.

Independent of 01-06; ships together with 08-15.

## Spec

1. **Radius tokens.** Runtime variables per theme in the `index.css` blocks:
   `--k-radius-window` 12px, `--k-radius-menu` 14px, `--k-radius-control` 8px,
   `--k-radius-item` 8px (list rows, rail items) and `--k-radius-tile` 12px,
   all `0px` in Classic. In `packages/ui/src/theme.css` expose them as
   Tailwind radius tokens (`--radius-window: var(--k-radius-window)` and so
   on), which gives `rounded-window`, `rounded-menu`, `rounded-control`,
   `rounded-item` and `rounded-tile`. Update `theme.test.ts` for the
   additions.
2. **The zero rule becomes Classic's.**
   `:root[data-os-theme='classic'] * { border-radius: 0 !important }`, so
   Classic can't drift. Delete or convert the 15 dead `rounded` uses first,
   so they don't come back to life in Apricot.
3. **Apply them:**
   - window frames, square when maximised or snapped to an edge;
   - the Start menu, context menus, dialogs and tooltips;
   - the kit's `Button`, `Input`, `Select`, `Checkbox` and segmented
     controls;
   - list rows and rail items;
   - taskbar buttons;
   - desktop icon tiles.
4. **Shadows.** Runtime variables `--k-shadow-window`,
   `--k-shadow-window-focused`, `--k-shadow-menu` and `--k-shadow-tile`, with
   the canvas's values for Apricot and today's for Classic.
5. **Apricot's chrome details** listed in Context:
   - Each is driven by a runtime variable or the `data-os-theme` attribute,
     never by a branch in component code that reads the store.
   - Classic keeps the full-width taskbar without padding, the flush Start
     menu, the accent border on the focused window and the top edge on the
     open Start button.
6. **Rules.** Update `ui-conventions.md`:
   - rule 8 (radius): only the five token radii are allowed, and numeric
     `rounded-*` stays banned;
   - rule 9 (shadows): the recipes become the shadow variables;
   - in the pre-flight checklist, item 3's "zero `rounded-*`" becomes "no
     numeric `rounded-*`".

## Must preserve

- Classic, pixel for pixel, in light and dark.
- The Win7-classic layout: positions, sizes, the taskbar's height (44px), the
  Start menu's size.
- Snapping, maximising and window resizing behave as today.

## Acceptance

- In Apricot light and dark, the desktop, the Start menu and a context menu,
  a dialog, Settings and File Manager match the canvas's shapes: corners,
  floating Start menu, pill buttons, current-task dot and icon tiles.
- Classic screenshots unchanged.
- A maximised window in Apricot has square corners.
- No `rounded-` class outside the five tokens (grep).
- `theme.test.ts`, typecheck and lint pass.

## Files you OWN

- `apps/core/src/index.css`: the radius and shadow variables, and the zero
  rule.
- `packages/ui/src/theme.css`: the radius tokens. `apps/core/src/theme.test.ts`
  for those.
- `packages/ui/src/components/*` (radius and shadow classes only).
- `apps/core/src/shared/components/window/`, `taskbar/`, `desktop/` (styling
  only).
- The three files with dead `rounded` uses.
- `corpus/wiki/ui-conventions.md`: rules 8 and 9 and the checklist item.
- `corpus/wiki/status.md`, `corpus/log.md`.
