# The kit Checkbox's empty box is faint in Classic dark

Found 2026-11-12 by imbatranim-apps brief 09 (its CAD Layers dialog, the FREEZE and LOCK columns): an unchecked kit
`Checkbox` (`packages/ui/src/components/Checkbox.tsx`) draws its border so close to the Classic dark surface that
the box nearly disappears. A control's boundary needs 3:1 against what is around it (WCAG 1.4.11; the estate's rule:
never fade a control below 3:1, fade the text around it instead).

## What to do

- Measure the border token the box uses against the Classic dark surfaces it sits on (window, dialog, table row),
  and the Apricot ones too.
- Use a token that reaches 3:1 in all four theme and mode combinations, and add the pair to `apps/core/src/contrast.test.ts`.
- Fits brief 88 (the redesign) if that runs first; the kit change reaches imbatranim-apps through `kit:sync`.
