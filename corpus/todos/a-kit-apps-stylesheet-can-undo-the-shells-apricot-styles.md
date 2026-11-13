---
title: A kit app's stylesheet can undo the shell's apricot styles
created: 2026-11-13
status: open
tags: [bug, theme, kit]
---

# A kit app's stylesheet can undo the shell's apricot styles

Brief 88's builder found this while shooting the redesign. A kit app's
stylesheet stays in the page once its window has opened, and it loads after
the desktop's own. Tailwind's `apricot:` variant (`apps/core/src/index.css`)
wraps its selector in `:where()`, so it adds no specificity, and a kit
utility for the same property, coming later in the page, wins.

Brief 88 fixed the two places the shots showed:

- the phone layout, with a `phone:` variant that `:root` raises a step
  (commit `41462bc`);
- the desktop tiles, which turned flat after Docs had been opened (`d0a445b`).

The shell's other `apricot:` styles (about 38 in `apps/core/src`, among them
the taskbar buttons and Start's position) still have the weakness. Nothing
has been seen to break, but every imbatranim-apps screen runs with a kit
stylesheet loaded.

The fix to weigh: raise `apricot:` the way `phone:` is raised, so the shell
always beats a kit utility, then check that no kit app relied on beating it.
Look at imbatranim-apps 11's screenshots first: if a shell part changes look
once an app is open, that is this bug.
