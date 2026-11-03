# Brief 21 — Settings fits a phone

## Context

From the todo [settings-apps-rows-overflow-on-a-phone](../../todos/settings-apps-rows-overflow-on-a-phone.md)
(2026-11-03). At 390 px the Settings page scrolls sideways: the Apps section's
rows reach 569 px because grid items keep their content's width, so
`truncate` never takes effect.

## Spec

1. Let the Apps rows shrink (`min-w-0` on the rows, or a `minmax(0, 1fr)`
   column), so names and descriptions truncate.
2. Check every Settings section at 390×844, and fix any other overflow the
   same way.

## Acceptance

- At 390×844 the Settings scroll area has no horizontal overflow
  (`scrollWidth` equals `clientWidth`).
- The page is unchanged at 1280×800.
- Typecheck, lint and the Settings tests pass.

## Files you OWN

`apps/core/src/modules/settings/**` (layout classes), the todo (to delete),
`corpus/wiki/status.md`, `corpus/log.md`.
