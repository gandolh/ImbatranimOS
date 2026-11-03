# Brief 20 — Every control has the accent focus ring

## Context

Settled 2026-11-03. Brief 15's walk found controls that show the browser's
default focus outline (a black or white double ring) instead of the house
`focus-visible` ring in the accent: Snipping Tool's capture options, the
Calculator's mode tabs, Archive Manager's close button, and likely others.
This predates the themes and looks the same in every theme.

## Spec

1. Find every focusable element (`<button>`, `<a>`, inputs, `role="button"`,
   `tabIndex`) in core, the add-ons and the kit whose classes set neither
   `outline-none` with a `focus-visible:` ring nor the kit's styles.
2. Give each the house ring: `outline-none
   focus-visible:ring-2 focus-visible:ring-primary` (inset where the control
   touches a border, as its siblings do).
3. ui-conventions' accessibility floor names the ring as the only focus
   style.

## Acceptance

- No control in the walked apps shows the browser outline when reached by
  keyboard.
- The audit and its list are in the outcome.
- Typecheck, lint and the touched tests pass.

## Files you OWN

Any app, core or kit file, for focus classes only. `corpus/wiki/ui-conventions.md`,
`corpus/wiki/status.md`, `corpus/log.md`.
