# Brief 96: The rest of the desktop holds still and fits a phone

**Depends on:** brief 91 (the kit's motion and touch rules). **Runs after:** 94.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-19 by the controller from brief 91's "still to do": the same rules brief 91 set for the kit and the File Manager, carried to what it left.

## Context

Brief 91 made the kit's transitions motion-safe, held the File Manager's busy spinners still under reduced motion (in the accent, with a label), and gave menu rows 44 px under 600 px. Left: `animate-spin` outside `motion-safe:` in core (4 places), the Code Editor (3), Image Viewer (2), Notepad (2), Logs (1) and Settings; the taskbar menu's workspace buttons stay 24 px on a phone; a menu popup has no max-height, so a 12-row menu may not fit a short phone.

## Decisions

- **Spinners:** each follows the File Manager's pattern from brief 91 (still under reduced motion, in the accent, with a text label for a screen reader), or `motion-safe:animate-spin` where a still icon already has a label beside it. `motion.test.ts` (brief 91) or its twin covers every add-on, so a new unguarded spin fails the check.
- **Workspace buttons:** 44 px targets under 600 px (`phone:` in core), the look unchanged at 1280.
- **Menus on a short phone:** every kit menu popup (the `Menu` and the `ContextMenu`) gets a max-height of the space available (Base UI's `--available-height` where Base UI places it) and scrolls inside; rows stay 44 px. imbatranim-apps' Slides font size list (24 rows) is the case to beat.
- **A row that keeps its menu open:** the kit's menu rows take Base UI's `closeOnClick` (default true), so a row that opens another list can keep the menu open. imbatranim-apps brief 17 had to hold CAD's More menu open with a 300 ms guard against the kit's close (`apps/cad/src/ui/StatusBar.tsx`); its brief 18 drops the guard once this lands. A new public prop: bump `SHARED_KIT_VERSION`.

## Files you OWN

- The spinner sites above, the taskbar's workspace buttons, the kit's menu popups and menu rows, their tests.
- Corpus: `wiki/ui-conventions.md`, `wiki/status.md`, `log.md`.

## What to do

1. Every spinner; the motion test across add-ons, failing on today's code.
2. The workspace buttons and the menu max-height, with tests by attribute and one walk in the dev container at 390x640 (a short phone): the desktop menu and a File Manager row menu fit and scroll; shots, read.

## Acceptance

- [ ] The tests pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`; the outcome note names the kit commit imbatranim-apps should sync to and the new `SHARED_KIT_VERSION`.
