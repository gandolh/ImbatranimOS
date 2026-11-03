# Brief 19 — Rounded boxes inside windows in Apricot

## Context

Settled 2026-11-03 ([decisions-themes.md](../../wiki/decisions-themes.md)).
In Apricot, bordered boxes and cards inside windows take the control radius.
Panels that fill a whole side of a window stay square. Brief 15's walk saw
square ones in:
- Settings (the section icons, the Apps rows, the cards of the other
  sections);
- Snipping Tool's capture options;
- System Monitor's charts and other apps' cards.

## Spec

1. Walk every app and Settings section in Apricot light, and list each
   bordered box, card or framed preview.
2. Give each `rounded-control` (`rounded-tile` for large previews), with
   `overflow-hidden` where a child fills the box.
3. Leave sidebars, toolbars, status bars, split panes and window-filling
   panels square.
4. Rule 9 in `ui-conventions.md`: "in-window content is flat" holds for
   Classic. In Apricot, boxes and cards take the control radius.

## Acceptance

- In Apricot no bordered box inside a window is square, apart from
  edge-to-edge panels.
- Classic pixel-identical.
- Typecheck, lint and the touched tests pass. The outcome lists what changed.

## Files you OWN

Any app or Settings file, for radius classes only.
`corpus/wiki/ui-conventions.md`, `corpus/wiki/status.md`, `corpus/log.md`.

## Outcome (2026-11-03)

**Built in `6ffebb4`.** Instead of a walk, a script listed every class string in
core's components and modules and the add-ons that holds a bare `border`
class and no radius: 119 strings in 55 files. Each was sorted by hand:
- **`rounded-control` (92):**
  - Settings: section icons, Apps rows, Startup and Default apps lists,
    storage, backup, About and Marketplace boxes;
  - search and filter fields, rename fields, text areas, small selects;
  - Todo's and the REST client's buttons and inputs;
  - Snipping Tool's capture options and annotation tools;
  - Solitaire's cards and Archive Manager's boxes;
  - Alt+Tab's cards, the toast's action button, the error fallback's box.
  
  The progress tracks (Archive Manager, System Monitor's gauge, stats and
  bars, Storage) and the sparklines also take `overflow-hidden`, so their
  fill follows the curve.
- **`rounded-small` (16)**, a new sixth token (`--k-radius-small`, 4px in
  Apricot, 0 in Classic, `theme.css` and `theme.test.ts` updated):
  - colour swatches (Calendar, Paint, Sticky Notes, Snipping Tool);
  - Todo's check box, due tag and overdue tag;
  - the key caps in the palette, the shortcuts overlay and Notepad;
  - the Markdown preview's chips.

  The Checkbox moved from its `calc()` radius onto it.
- **`rounded-menu`:** Code Editor's menu dropdown. **`rounded-tile`:** the
  desktop's widget frame.
- **Left alone (10):**
  - window frames, the Start menu, task buttons and toasts, already rounded
    by another string on the same element;
  - the desktop's rubber band;
  - Paint's canvas and the text box drawn on it;
  - Minesweeper's cells;
  - the second line of the Calculator toolbar's key class.

List boxes didn't take `overflow-hidden`, so children's focus rings aren't
clipped.

`ui-conventions.md` rule 8 now says six token radii and that in-window
boxes and cards take the control radius in Apricot. Rule 9 says in-window
content is flat as in "no shadow".

**Checked:**
- Typecheck; no lint errors.
- Tests: core's full suite (622), the kit (36), and all 21 touched add-ons.
- Classic's File Manager window is identical to before brief 08 (0 pixels),
  light and dark.
- In Apricot light these show the radii: Snipping Tool's options, System
  Monitor's bars, Solitaire's cards, the REST client's fields and Settings.
- Vite was restarted after the kit edits.
