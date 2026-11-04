# Brief 38 — A desktop layer that crashes leaves the desktop standing

## Context

Each window has its own error boundary, so an app that throws shows "stopped
working" in its window and the desktop stays. An add-on's **desktop layer**
(`desktopLayer` in the add-on contract; today Sticky Notes' `DesktopNotes`) is
mounted by `Desktop.tsx` with none: when it throws, React unmounts the whole
tree and the page goes black. Found while building brief 24 (2026-11-03), where
the tray and the notes layer each did exactly that on a host run with
`VITE_API_URL` unset. Both reads were fixed then; the missing boundary was not.

The owner chose on 2026-11-04 that a crashed layer hides **and** says so, the
way a window says "stopped working".

## Spec

1. `Desktop.tsx` wraps each desktop layer in its own error boundary. A layer
   that throws draws nothing; the icons, wallpaper, taskbar and every other
   layer stay.
2. When a layer crashes, one notification through the system notify path
   names the add-on: "Sticky Notes stopped working on the desktop." One per
   crash, not one per render.
3. The layer stays hidden until the desktop mounts again (a reload, or the
   add-on being turned off and on). No retry loop.

## Must preserve

- Windows' own boundaries and their "stopped working" screen.
- Brief 24's decision: the tray itself gets no boundary; this is the add-on
  side, where core can't vet the code.

## Acceptance

- A test mounts the desktop with a layer that throws: the desktop renders, the
  layer doesn't, and one notification names the add-on.
- Sticky Notes still draws its notes when nothing throws.

## Files you OWN

- `apps/core/src/shared/components/desktop/Desktop.tsx` and a small boundary
  component beside it
- Its tests
