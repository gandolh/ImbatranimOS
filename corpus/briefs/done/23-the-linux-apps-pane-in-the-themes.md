# Brief 23 — The Linux apps pane in the themes

## Context

The Linux apps layer (briefs 01-06) was written before the theme briefs
(08-21) and merged with them on 2026-11-03. Scanned with the same checks as
briefs 10, 19 and 20, it has no strong selection fills, but six bordered
boxes in `apps/core/src/modules/settings/LinuxAppsSettings.tsx` have no
radius, so they stay square in Apricot:

- the two error notices (around lines 175 and 181);
- the search results list (204);
- the small kind badge (223);
- the log box (265);
- the installed list (278).

The owner decided on 2026-11-03 that the Linux window's focusable surface
(`LinuxWindowBody.tsx`, the `tabIndex={0}` holder) does **not** show the
accent focus ring: it is the app's own surface, and the app draws its own
focus. Promoted from the todo `linux-apps-ui-in-the-themes`.

## Spec

1. Give the five boxes `rounded-control` and the kind badge `rounded-small`.
2. Round the rows inside the search results and installed lists the way
   brief 17 did for inset list rows.
3. Leave `LinuxWindowBody.tsx`'s surface without the accent ring. If brief
   20's global focus style reaches it, opt it out there, with a comment that
   says why.

## Acceptance

- In Apricot light and Classic dark, Settings → Linux apps shows the six
  boxes and the list rows rounded, and Classic still looks as it did.
- Focusing a Linux window's surface with the keyboard shows no accent ring;
  its title bar's controls still do.
- Typecheck, lint and the tests of `apps/core` that cover these files pass.

## Files you OWN

- `apps/core/src/modules/settings/LinuxAppsSettings.tsx`
- `apps/core/src/modules/linux-windows/LinuxWindowBody.tsx` (the focus
  opt-out only)

## Outcome (2026-11-03)

**Built in `3fb02f4` (version 1.109.0).** As specified:
- the two error notices, the search results list, the log box and the
  installed list take `rounded-control`; the Unfree badge takes
  `rounded-small`;
- both lists inset their rows by `--k-list-inset` with `apricot:py-1`, round
  them with `rounded-item`, and their dividers are
  `apricot:divide-transparent`, as brief 17 did. The rows have no fill, so
  the rounding shows only on their edges and spacing.

`LinuxWindowBody.tsx`'s surface needed no opt-out: brief 20 added rings class
by class, not through a global style, so nothing reached it. It gained a
comment saying why it has none, so the next audit of rule 36 doesn't add one;
rule 36 in ui-conventions names the exception.

**Checked** in the dev container (rebuilt from this tree, Chromium):
- Apricot light: computed radii 8 px on the boxes and rows, 4 px on the
  badge; the shot shows the rounded box with inset rows and no dividers.
- Classic dark: every radius 0, and the pane inside the window is identical,
  pixel for pixel, to the same pane drawn from the file before the change
  (swapped in through Vite). Classic's dividers stay `currentColor`, white on
  dark, as before; nothing here touched them.
- foot, opened from a Terminal, then focused by script after a key press:
  its surface is `:focus-visible` with no box-shadow and no outline; the
  title bar's Minimize shows the accent ring (2 px inset).
- Typecheck, lint, and core's settings and linux-windows tests (40) pass.
