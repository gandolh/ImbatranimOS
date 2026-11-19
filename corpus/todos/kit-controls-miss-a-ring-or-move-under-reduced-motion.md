---
title: Kit controls that miss a focus ring or move under reduced motion
created: 2026-11-15
status: promoted
tags: [bug, kit, a11y]
---

# Kit controls that miss a focus ring or move under reduced motion

Promoted 2026-11-19 to [brief 91](../briefs/todo/91-kit-controls-show-focus-hold-still-and-read-in-classic-dark.md).

imbatranim-apps' brief 11 walked every app screen with Tab in the four
looks and sampled motion under `prefers-reduced-motion: reduce`, against
the kit at `5e075a0`. The apps worked around what they could. These
belong to the kit or the shell:

1. The ghost `Button` draws no focus ring.
2. `Input` rings only on `data-focused`, which needs a `Field` around it,
   and then only at 40% opacity. An Input on its own shows no ring.
3. `ScrollArea`'s viewport takes Tab but draws no ring.
4. `Select`, `Checkbox` and `Input` use `transition-colors` without
   `motion-safe:`.
5. The File Manager's spinner keeps spinning under reduced motion.
6. `reportFileRefusal`'s body holds an em dash
   (`packages/ui/src/lib/fileFailureText.ts`).
7. Classic dark's crimson reads 2.67 to 3.3:1 on the dark surfaces, as
   text and as a ring. The lowest was a selected row's checkbox ring on
   `surface-container-high`, at 2.67:1. A ring needs 3:1, and text needs
   4.5:1.

Fix 1 to 6 in the kit and shell, then `kit:sync` imbatranim-apps and
drop the workarounds its brief 11 added (`53f9122`, `098849f`). Item 7
changes the Classic dark palette, so it is a taste call to show the owner
before building.
