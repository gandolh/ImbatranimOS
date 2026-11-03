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

## Outcome (2026-11-03)

**Built in `d4e8ed6`.**

**The audit.** A script read each opening tag, brace-aware, for these
elements in `apps/core/src`, `apps/add-ons` and `packages/ui/src`:
- `button`, `a[href]`, `input`, `select`, `textarea`, `summary`;
- anything with `role="button"` or a non-negative `tabIndex`.

It flagged each tag with no `focus:`, `focus-visible:` or
`focus-within:` class: **188** hits. False hits:
- tags quoted inside comments;
- two hidden file inputs;
- Markdown preview content (links, task checkboxes);
- Settings' radio options, whose ring arrives through `className`;
- Snipping Tool's toolbar, whose shared constant already had the ring.

**Fixed:**
- 144 class strings, inserted by script: the house ring (`outline-none`
  added where missing), or the accent outline for native checkboxes, radios
  and the colour input.
- By hand: the Calculator's two `key` constants, CaptureLauncher's `row`,
  Todo's `tab`, Media Player's `RANGE_CLASSES` (outline), the File Picker's
  bare checkbox and Snipping Tool's inline text field.

The places named in brief 15 (Snipping Tool's capture options, the
Calculator's mode tabs, Archive Manager's close button) now show the accent
ring when focused. ui-conventions rule 36 says no control may fall back to
the browser outline, and names the outline form for native inputs.

**Checked:**
- Typecheck; no lint errors.
- Tests: core's full suite (622) and all 19 touched add-ons.
- In Apricot light, the three controls show the accent ring.
- Classic's File Manager and Settings windows are unchanged (0 pixels against
  the earlier shots).
- Not walked by keyboard app by app. The scan is the evidence for the rest.
