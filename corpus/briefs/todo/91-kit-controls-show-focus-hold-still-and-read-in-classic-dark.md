# Task 91: Kit controls show their focus, hold still under reduced motion, and read in Classic dark

**Depends on:** nothing in this repo. imbatranim-apps brief 17 waits for
this one (it `kit:sync`s to this brief's last commit and drops its
workarounds).

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of 2026-11-15
([todos/kit-controls-miss-a-ring-or-move-under-reduced-motion.md](../../todos/kit-controls-miss-a-ring-or-move-under-reduced-motion.md))
in the owner's backlog grill, with imbatranim-apps-15's question 1 (menu
rows on a phone) folded in.

## Context

imbatranim-apps' brief 11 walked every app screen with Tab in the four looks
and sampled motion under `prefers-reduced-motion: reduce`, against the kit
at `5e075a0`. What belongs to the kit or the shell:

1. The ghost `Button` draws no focus ring (`packages/ui/src/components/Button.tsx`).
2. `Input` rings only on `data-focused`, which needs a `Field` around it,
   and then at 40% opacity. An Input on its own shows no ring (`Input.tsx`).
3. `ScrollArea`'s viewport takes Tab but draws no ring (`ScrollArea.tsx`).
4. `Select`, `Checkbox` and `Input` use `transition-colors` without
   `motion-safe:`.
5. The File Manager's spinner keeps spinning under reduced motion
   (`apps/add-ons/file-manager/`).
6. `reportFileRefusal`'s body holds an em dash
   (`packages/ui/src/lib/fileFailureText.ts`).
7. Classic dark's crimson (`#c0263a`, one fill in both modes,
   `apps/core/src/shared/store/appearanceStore.ts`) reads 2.67 to 3.3:1 on
   the dark surfaces, as text and as a ring. The lowest was a selected row's
   checkbox ring on `surface-container-high`, 2.67:1. `contrast.test.ts`
   notes the gap, and that cobalt reaches 2.9:1 there too.
8. The kit's menu rows are 26.5 px tall on a phone; every More menu in
   imbatranim-apps and the shell's menus use them (`ContextMenu.tsx` and
   the menus built on it).

## Owner decisions (2026-11-19)

1. **Lift Classic dark's crimson, in dark only,** enough to clear 3:1 as a
   ring and 4.5:1 as text on every dark surface up to
   `surface-container-high`, keeping its hue. Classic light keeps `#c0263a`.
   The same move as Classic's error red, already lifted from `#ff6b6b` to
   `#ff8a80` for dark (`index.css`).
2. **Menu rows are 44 px tall under 600 px.** Desktop keeps today's compact
   rows.

Technical defaults (the controller's, by the owner's rule above; record a
change on the ticket):

- Every other Classic accent that fails the same bar in dark (cobalt at
  2.9:1, and any the test finds) gets the same lift, in dark only, keeping
  its hue. A Classic accent becomes two values (light and dark), like
  Apricot's; white on the light fill stays at 4.5:1 or more.
- Rings follow `ui-conventions.md` (the token ring, 2 px, offset as the
  other kit controls draw it); `Input` rings on its own focus, with or
  without a `Field`.
- Under reduced motion the spinner shows a still busy state with its label,
  and colour transitions are `motion-safe:` only.

## Files you OWN

- `packages/ui/src/components/`: `Button.tsx`, `Input.tsx`, `ScrollArea.tsx`,
  `Select.tsx`, `Checkbox.tsx`, `ContextMenu.tsx` and the menu pieces it
  shares, with tests
- `packages/ui/src/lib/fileFailureText.ts`
- `apps/add-ons/file-manager/src/` (the spinner only)
- `apps/core/src/shared/store/appearanceStore.ts`, `apps/core/src/contrast.test.ts`
- Corpus: `wiki/decisions-themes.md` (a dated line: Classic dark's accents
  lifted, the owner's 2026-11-19 call, revisiting "kept whole"),
  `wiki/ui-conventions.md` (menu rows on a phone, rings), `wiki/status.md`,
  `log.md`, the todo (delete it at closeout)

## Files you must NOT touch

- `vendor/house-style/`; imbatranim-apps (its brief 17 takes the kit).
- Apricot's values.

## What to do

1. Items 1-4 and 6 in the kit, with tests (a ring present on keyboard focus
   for the ghost Button, a bare Input, the ScrollArea viewport; no
   `transition-colors` outside `motion-safe:` in the kit, by a test or a
   lint rule if one fits).
2. Item 5, the spinner.
3. Item 7: the lifted dark values; `contrast.test.ts` holds every Classic
   accent in dark to 3:1 as a ring and 4.5:1 as text on `surface` to
   `surface-container-high`, and white on each light fill to 4.5:1. Drop the
   "known gap" carve-outs the test has today.
4. Item 8: menu rows 44 px under 600 px.
5. Walk in the dev container (`infrastructure-dev-1`, started, never
   recreated): Tab through Settings, the File Manager and a kit app in
   Classic dark and Apricot light at 1280; a menu at 390. Shots at 1280
   (Classic dark, rings on) and 390 (a menu open, Apricot light and Classic
   dark).

## Acceptance

- [ ] Items 1-8 done, each with a test where a test can show it.
- [ ] `contrast.test.ts` passes with no Classic dark carve-out.
- [ ] Menu rows measure 44 px at 390 and today's height at 1280.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
