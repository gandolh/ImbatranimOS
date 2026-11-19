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

## Outcome (2026-11-19)

Built in five local commits. `ee97a50` (1.355.0), items 1-4 and 6: the ghost Button takes the default one's inset
accent ring; Input rings on `focus-visible` with or without a Field, full strength, with a primary border; ScrollArea's
viewport rings through an `aria-hidden` layer drawn after it (`peer-focus-visible:`), because an inset ring on the
viewport paints under its rows and an outer one is clipped by the panel; Select, Checkbox and Input transitions are
`motion-safe:` only, and `packages/ui/src/motion.test.ts` scans the kit for any that isn't; `focusRings.test.tsx` holds
the ring classes. The em dash sat in `packages/ui/src/hooks/systemHooks.tsx` (in `reportFileRefusal` and
`reportFileFailure`), not in `fileFailureText.ts`: both bodies name the file with a colon now. `8ed881a` (1.356.0),
item 5: the File Manager has two spinners, the refresh icon and the search's busy glyph. Both spin under `motion-safe:`
only; busy, the refresh icon takes the accent and the button is named Refreshing (Refresh at rest, `aria-busy`), and
the search glyph is named Searching (`SearchBox.test.tsx`). `4ad9a33` (1.357.0), item 7: each Classic accent keeps its
hue and, in dark only, is lifted to about 4.6:1 on `surface-container-high` (crimson `#e06474`, cobalt `#588ae7`,
emerald `#14a154`, signal `#e96036`). Classic stays one fill in every slot, a value per mode; white on a lifted fill is
about 3.4:1, so dark takes Classic's ink `#16161a` (about 5.3:1). `contrast.test.ts` has no Classic dark carve-out and
holds each dark accent as text and ring on `surface` to `surface-container-high`, its ink, and its hue. Outside the
brief's file list: the backend's portal accent mirror (`dbus/settings.ts` and its spec) and `appearanceStore.test.ts`.
`c9f2735` (1.358.0), item 8: kit menu rows take `max-[600px]:min-h-target`, 44 px under 600 px and 22.5 px at 1280
as before (`phone:` exists only in the desktop's stylesheet; min-height leaves no utility of a kit app's stylesheet to
compete). `ba86f86` (1.359.0): a check for white on an accent fill found the Snipping Tool's size badge, which takes
`--accent-on` now.

The walk in the dev container: Settings, the File Manager and the REST Client tabbed at 1280 in Classic dark and
Apricot light, every stop ringed in the accent, the ScrollArea layer included; menus at 390 in both looks, every row
44 px (a 9-row File Manager menu sat at 271-698 px of 844); under reduced motion the refresh icon holds still in the
accent while named Refreshing, and spins without it. Shots in the builder's scratch, not the repo. `npm run check`
exit 0 (a first full run failed only on the known `RadioGroup.test.tsx` 5 s timeout, which passed alone).

Left for later: the other spinners in the OS (Logs, Notepad, Code Editor, Image Viewer, Settings) still spin under
reduced motion; the taskbar menu's workspace buttons are a custom row at 24 px on a phone; the ContextMenu popup has
no max-height, so a 12-row menu may not fit a short phone. For imbatranim-apps brief 17: sync the kit to `c9f2735`;
`53f9122` becomes redundant; `098849f` is still needed (Classic's soft fill is its strong one in each mode);
`apps/docs/src/App.test.tsx` pins the old dash body; its focus spec's Classic dark gap allowance
(`tools/browser/focus.spec.ts`) can go. Owner step: `node cli.ts imbatranim-os server`.
