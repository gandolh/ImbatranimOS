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
