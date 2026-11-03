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
