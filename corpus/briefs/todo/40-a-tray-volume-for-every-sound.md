# Brief 40 — A tray volume for every sound

## Context

[real-os-gaps.md](../../wiki/real-os-gaps.md) rejected a global volume, mute
or mixer on 2026-07-31 because the media player's own `<audio>` was the only
sound, and said to revisit "when a second sound source exists". Brief 39 adds
one: Linux apps' sound. On 2026-11-04 the owner chose a **full tray volume**:
one slider and a mute over all of the OS's sound. Recorded in
[decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).

## Spec

1. A speaker icon in the tray opens a small panel with a volume slider
   (0-100) and a mute toggle. The icon shows muted and roughly how loud.
2. The level and mute are a user preference that survives a reload.
3. The setting reaches every sound source:
   - the media player add-on, through the system handle (a read and a
     subscribe, so it follows changes live); its own player volume still
     works and multiplies with the tray's;
   - the Linux sound stream from brief 39, applied in the tab's Web Audio
     gain.
4. The add-on contract documents the new system call; add-ons that make no
   sound need nothing.

## Must preserve

- The media player's own controls.
- Win7-classic tray layout and the current themes' look for the panel.

## Acceptance

- Moving the slider changes the media player's loudness and a Linux app's
  loudness together; mute silences both; a reload keeps both settings.
- Tests for the preference and the system call pass.

## Files you OWN

- `apps/core/src/shared/components/taskbar/` (the tray icon and panel)
- `apps/core/src/system/` and `apps/core/src/contract.ts` (the volume call)
- `apps/add-ons/media-player/` (applying it)
- `apps/core/src/modules/linux-windows/` (the gain on the Linux stream)

Runs after 39.
