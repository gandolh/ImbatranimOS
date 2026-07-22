# Brief 53 — File Manager renders an invalid nested `<button>`

Status: **todo** · From the 2026-07-19 headless-browser walkthrough (bug #1 of
[todos/app-walkthrough-bugs.md](../../todos/app-walkthrough-bugs.md)). Add-on,
frontend-only. Tiny, standalone. No dependency.

## Problem

The **only** console errors in the whole 23-app walkthrough were React's *"In
HTML, `<button>` cannot be a descendant of `<button>` … this will cause a
hydration error"*, traced to the File Manager subtree. A row (or list item)
renders an interactive control (button) nested inside an outer button. This is
invalid HTML: it hurts accessibility (nested interactive elements confuse AT and
keyboard focus order) and can **swallow or duplicate clicks** on the inner
control.

## Fix

1. Find the nested-button site in
   [apps/add-ons/file-manager/src](../../apps/add-ons/file-manager/src) (the row
   / list-item component that also hosts an inline action button — likely the
   file/folder row with a context-menu or inline action trigger).
2. Restructure so only one `<button>` remains in the interactive path: make the
   outer element a non-button (`div`/`li` with `role` + keyboard handlers, or a
   click target that is not a `<button>`), keeping the inner action a real
   button; or invert (outer button, inner non-button). Preserve the exact click,
   keyboard-activation, and focus behavior.

## Must preserve (regression surface)

- Single-click select, double-click/Enter open, context-menu, and any inline
  row action all behave exactly as before.
- Keyboard focus order and activation (Enter/Space) unchanged; the row is still
  reachable and operable by keyboard.
- No console errors on File Manager mount or interaction.

## Verify bar

`turbo typecheck`, file-manager lint + format, `turbo build` green. **Human-
gated:** open File Manager, confirm zero `<button>`-in-`<button>` console errors,
and that row select / open / context-menu / inline actions still work by mouse
and keyboard.
