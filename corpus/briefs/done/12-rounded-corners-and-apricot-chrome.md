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

## Outcome (2026-11-03)

**Built in `547b223` (version 1.78.0).**

**Radii.** `--k-radius-window` / `-menu` / `-control` / `-item` / `-tile` are
12, 14, 8, 8 and 12px under `:root, :root[data-os-theme='apricot']`, and
`0px` under Classic. `theme.css` exposes them as `rounded-window` and so on,
and `theme.test.ts` has the five added entries.

The zero rule is now `:root[data-os-theme='classic'] * { border-radius: 0
!important }`. The 15 dead `rounded` uses the brief expected were already gone
on 2026-11-03: a grep finds only comments and the calculator's "rounded ·"
label.

The one radius that isn't a token: the Checkbox uses
`rounded-[calc(var(--radius-control)/2)]`, because 8px on a 16px box makes a
circle.

**Shadows.** Six variables, used as `shadow-(--k-shadow-…)`:
- `window`, `window-focused`, `menu` and `tile`, as the brief listed;
- `popup` (context menus, Select) and `dialog` (the kit's dialogs, Alt+Tab),
  added so those recipes could follow the theme without changing Classic.

Classic's values are the old recipes exactly. Apricot light uses the canvas's
`rgba(140, 84, 48, …)` set. Apricot dark uses its black set. Popups take the
canvas's menu shadow and dialogs its focused-window shadow. Still literal
(black) in both themes: toasts, tooltips, tray popovers and the sign-in card.
They are left for 15's walk.

**Where the radii are applied:**
- window frames, which drop `rounded-window` when maximised or snapped (0px
  checked live; 12px again after restore);
- the title tick and title buttons;
- the Start menu (`rounded-menu`, `overflow-hidden`) and its rows and icon
  boxes;
- the kit's ContextMenu and Select popups and items, Dialog and its close
  button, Tooltip, Button, Input and Select trigger;
- toasts, tray popovers, the command palette, Alt+Tab and the sign-in card;
- the taskbar's Start, Search and task buttons, and the workspace pips;
- desktop icon tiles and labels;
- File Manager's folder tree rows and grid tiles.

A seventh variable, `--k-list-inset` (6px in Apricot, 0 in Classic), pads
context menus, Select popups and the folder tree, so a rounded highlight
clears the edge. The Start menu lists use `apricot:px-1.5`.

The brief said "pill-shaped" buttons. The canvas draws Start and the task
buttons at the control radius and only Search as a full pill. All three use
`rounded-control` here, since a full pill isn't one of the five tokens.

**Apricot's chrome.** It comes from a new `@custom-variant apricot` in
`index.css` (`[data-os-theme='apricot']` and its descendants). Classic keeps
the plain classes, so it can't change.
- Taskbar: `apricot:px-2 py-1.5 gap-1.5`, no separators. The Search button is
  on `bg-surface-container`. The Start button has no top accent edge.
- The current task's bar becomes a 14×3px centred dot 3px from the bottom.
  The focused task drops its border.
- Start menu: `apricot:left-2 apricot:mb-2`, so it floats 8px off the screen's
  edge and the taskbar.
- Focused window: `apricot:border-outline-variant`, no accent border.
- Desktop icons: a `bg-surface-container-lowest` tile with the tile shadow,
  no border, and the glyph in the strong accent.

The variant lives in the desktop's `index.css`, not the kit, so the kit's
components use only the radius tokens and the runtime variables. A kit app
built in another repo keeps working without the variant.

**Not done:**
- File Manager's list view is a `<table>` with `border-collapse`, where rows
  can't take a radius, so its rows stay square. The canvas shows rounded,
  inset rows. Doing that means moving the list to `border-separate` or off
  `<table>`.
- Settings' own Light/Dark and swatch buttons are hand-built and still square.
  Brief 14 rebuilds that section.

**Checked:**
- Typecheck; lint (the old FilePicker warning only).
- Tests: `theme.test.ts`, `contrast.test.ts`, core's components and auth
  (133), the kit (36), file-manager (85).
- The grep: no `rounded-` class outside the five tokens, apart from the
  Checkbox's derived one.
- Screenshots on a freshly started Vite: Classic light and dark windows are
  the same as before brief 08 (0 pixels). On the desktop only the tray's live
  stats differ.
- Apricot light and dark show 12px windows, the floating 14px Start menu,
  rounded buttons and inputs, tree rows inset with rounded highlights, icon
  tiles, and the current-task dot.
- A context menu is 14px with the popup shadow. The taskbar stays 44px.

**A trap for 13-15:** Vite's file watcher (WSL) missed an edit to
`packages/ui/src/components/Button.tsx` and kept serving the old transform
until Vite was restarted. The first round of screenshots showed square
buttons. After editing `packages/ui`, check
`curl …/@fs/<repo>/packages/ui/src/components/<file>.tsx`, or restart Vite.
