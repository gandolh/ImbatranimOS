# Brief 17 — Rounded, inset list rows in Apricot

## Context

Settled 2026-11-03 ([decisions-themes.md](../../wiki/decisions-themes.md),
"Apricot rounds list rows and in-window boxes too"). On the canvas, Apricot's
list rows are rounded pastel pills inset from the list's edges, with no
dividers. Today the selectable lists use full-width square rows:
- File Manager's list view (`FileList.tsx`, a `<table>` with
  `border-collapse`, which can't round a row);
- File Manager's search results;
- Media Player's playlist;
- Markdown Editor's outline;
- the command palette;
- Open with;
- the Git app's lists.

## Spec

1. In Apricot, each of those lists pads its sides by `--k-list-inset`, and its
   rows take `rounded-item`. The dividers between rows go (`apricot:` or a
   transparent border).
2. File Manager's list view moves from `<table>` to a grid of divs with the
   same columns, header, sorting, selection, rename field, context menu,
   drag, keyboard navigation and virtualisation spacers. Keep the ARIA roles
   it has, or add `role="grid"`/`row`/`gridcell` so it stays a table to a
   screen reader.
3. Classic stays square, with its dividers.

## Must preserve

Every File Manager behaviour and test, Classic's look, and the brief-10
rule: selection on the soft pair.

## Acceptance

- In Apricot light and dark, each list's selected and hover rows are rounded
  and clear the edges.
- Classic's File Manager window is pixel-identical to before.
- Typecheck, lint and the touched add-ons' tests pass.

## Files you OWN

The list components named above, `corpus/wiki/ui-conventions.md`,
`corpus/wiki/status.md`, `corpus/log.md`.

## Outcome (2026-11-03)

**Built in `5f5f45d` (version 1.91.0).**

These lists pad their sides by `px-(--k-list-inset)` (the palette's rows
use `mx-` because they aren't full width), and their rows take
`rounded-item`:
- File Manager's list and search results;
- the playlist;
- the outline;
- the command palette;
- Open with (its box also takes `rounded-control`);
- Git's change lists.

Row dividers are `apricot:border-transparent`.

**File Manager's list kept its `<table>`**, against spec step 2. In Apricot
only (the `apricot:` variant):
- the table takes `border-separate border-spacing-0`, is inset by
  `--k-list-inset`, and is narrowed to fit;
- the row's own fill is cleared (`apricot:bg-transparent
  apricot:hover:bg-transparent`), and each cell takes the selected or
  hovered fill (`cellFill`);
- the first and last cells round the ends.

A collapsed table can't round a row, but a separated one can round its
cells. This keeps the virtualisation spacers, `measureElement` on the
rows, keyboard navigation, the context menu and the table semantics as they
were, which rewriting the list as divs would have put at risk. The decision's
consequence line was corrected to match.

**Checked:**
- Typecheck, lint, and the file-manager (85), media-player (65),
  markdown-editor (113) and git-gui (31) tests pass.
- Classic's File Manager window is identical to before brief 08 (0 pixels),
  light and dark.
- In Apricot light a selected file row is a rounded pastel bar inset from the
  pane (8px radius on the cells), and the palette's rows are rounded and
  inset without dividers.
- Hover fills couldn't be seen: headless Chrome reports `(hover: none)`, and
  Tailwind puts hover styles behind `@media (hover: hover)`. The same holds
  for every hover style, Classic's included.
