---
summary: Rules 47 and 48 of the house UI style, split out of ui-conventions.md on 2026-11-03 with their numbers kept — an app paints outside its window only through `desktopLayer` (mounted always, pointer-events opt-in, above the icons and below every window), and a desktop object is clamped on commit, can leave the desktop without being deleted, and persists once on release.
updated: 2026-11-03
---

# UI conventions: painting on the desktop

Section 9 of [ui-conventions.md](ui-conventions.md), moved here when that page
passed 200 lines. The rule numbers stay as they were, so "§47" still means the
first rule below. The sticky-notes work (2026-08-05) is the worked example.

47. **An app may paint outside its window, and only through `desktopLayer`.** Set `desktopLayer` on your manifest (`contract.ts:41`, added by the sticky-notes work (2026-08-05)) and core mounts it on
    the desktop with no import of your package — the same seam as `commandSources`. `Desktop.tsx` collects the layers from `useEnabledApps()` and renders each inside one
    `pointer-events-none absolute inset-0` wrapper with `<Suspense fallback={null}>`, placed **after** the icon container and **before** `WindowContainer`. The three rules that
    follow from that, all of them load-bearing:
    - It is mounted **always**, whether or not the app's window is open. Return `null` cheaply when you have nothing to draw; do not poll, and share the app's existing
      react-query cache rather than opening a second one.
    - The wrapper is `pointer-events-none`, so the layer never eats a click meant for the wallpaper or an icon. Every interactive element inside opts back in with
      `pointer-events-auto` on itself (`sticky-notes/src/DesktopNote.tsx:97`) — including any dialog the layer renders (`DesktopNotes.tsx`).
    - It sits **above** the icon grid (which spans the whole desktop and would otherwise intercept everything) and **below** every window, so windows always win the z-order.
      Verify that by resolving a point inside an open window with `elementFromPoint`, not by eyeballing it.
48. **A desktop object needs a way back.** Anything the user can drag must be clamped inside the desktop on commit (`sticky-notes/src/noteGeometry.ts`, which keeps the clamp
    pure and tested because a note dropped off the edge cannot be recovered by any gesture) — a note dropped past the edge is
    unreachable after a reload — and must be removable from the desktop without being destroyed. Keep the two verbs distinct and label them so: "take off the desktop (the note
    is kept)" vs. "delete". Persist a drag or resize **once on release**, never per pointer move, and use `setPointerCapture` so a fast gesture off the element does not drop
    (`sticky-notes/src/usePointerDrag.ts`).
