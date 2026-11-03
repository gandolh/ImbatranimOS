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
