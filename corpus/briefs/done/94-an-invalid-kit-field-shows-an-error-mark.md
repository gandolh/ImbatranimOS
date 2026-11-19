# Brief 94: An invalid kit field shows an error mark, not only a red border

**Depends on:** brief 91 (Classic dark's lifted accents). **Runs after:** 95 (the dev container is busy until imbatranim-apps 17 ends).

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-19 from the owner's grill ("Mark invalid by shape"), on brief 91's finding: in Classic dark with the Crimson accent, a focused field's ring (`#e06474`) and an invalid field's border (`#ff6b6b`) sit about 1.2:1 apart, so focus and an error look alike.

## Context

The kit's `Input` (`packages/ui/src/components/Input.tsx`) marks invalid only with `data-[invalid]:border-error`. Colour alone (WCAG 1.4.1) fails here for one accent and theme today, and for any accent close to the error red tomorrow.

## Decisions

- **An error mark inside an invalid field:** a small circle-alert icon (lucide, the kit's icon set) at the field's inline end, in the error colour, `aria-hidden` (the field's `aria-invalid` and the form's message carry the meaning). The text keeps room for it (end padding only while invalid).
- **Every kit field that can be invalid** gets the same mark: find each kit control with an invalid state (`Input` today; a textarea, select or number field if the kit has one).
- **No public prop changes:** `SHARED_KIT_VERSION` stays; imbatranim-apps takes the mark on its next `kit:sync`.
- The ring stays as brief 91 left it.

## Files you OWN

- `packages/ui/src/components/` (the fields that can be invalid) and their tests.
- Corpus: `wiki/ui-conventions.md` (the rule: an error shows by shape too), `wiki/status.md`, `log.md`.

## What to do

1. The mark in each invalid-capable kit field; tests by role and attribute: an invalid field renders the mark, a valid one doesn't, the mark is hidden from the accessibility tree.
2. Walk in the dev container: an invalid and a focused field side by side in Classic dark with Crimson, and in Apricot light, at 1280 and 390; shots, read each.

## Acceptance

- [ ] The tests pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`; the outcome note names the kit commit imbatranim-apps should sync to.

## Outcome (2026-11-19)

`57781e5` (1.366.0): the kit `Input` draws a circle-alert mark (lucide, `aria-hidden`) at its inline end while `aria-invalid` is set, with end padding only then. `Input` was the only invalid-capable field in the kit (`Select` has no invalid state, and there is no textarea or number field). The mark follows the `aria-invalid` prop; a field whose invalidity comes only from a Base UI `Field` passes `aria-invalid` too (nothing in the OS does today). No public prop change, `SHARED_KIT_VERSION` stays 1. imbatranim-apps should sync the kit to `57781e5`. Walked in the dev container on a throwaway page (removed after): the invalid and the focused field side by side in Classic dark with Crimson and in Apricot light, at 1280 and 390; the mark tells them apart.
