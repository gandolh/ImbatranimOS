# Brief 18 — Warm shadows for toasts, tooltips, the tray and sign-in

## Context

Settled 2026-11-03. Brief 12 moved windows, menus, popups and dialogs to
`--k-shadow-*` variables, which are warm in Apricot. Four layers kept literal
black shadows:
- toasts (`0 6px 24px rgba(0,0,0,.35)`);
- the kit's Tooltip (`0 6px 18px rgba(0,0,0,.4)`);
- the tray's popovers (`0 -6px 24px rgba(0,0,0,.35)`);
- the sign-in card (`0 28px 80px rgba(0,0,0,.55)`).

## Spec

1. Four variables, `--k-shadow-toast`, `-tooltip`, `-tray` and `-card`.
   Classic's values are the literals above, exactly. Apricot's are the
   canvas's warm recipes (light) and its night ones (dark):
   - toast: the popup shadow;
   - tooltip: the unfocused window shadow;
   - tray: the menu shadow;
   - card: the dialog shadow.
2. The four layers use `shadow-(--k-shadow-…)`.
3. Rule 9 in `ui-conventions.md` lists them.

## Acceptance

- Classic pixel-identical.
- The four layers in Apricot show warm shadows.
- `theme.test.ts`, typecheck and lint pass.

## Files you OWN

`apps/core/src/index.css` (the shadow variables), the four components,
`corpus/wiki/ui-conventions.md`, `corpus/wiki/status.md`, `corpus/log.md`.
