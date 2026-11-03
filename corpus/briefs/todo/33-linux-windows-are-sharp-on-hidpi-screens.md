# Brief 33 — Linux windows are sharp on HiDPI screens

## Context

`wl_output`'s scale stays 1, so on a screen whose `devicePixelRatio` is
above 1 the browser upscales every Linux window's frames and they look
soft. Split out of the todo `linux-apps-after-the-first-wave` with the
owner on 2026-11-03.

## Spec

1. The tab tells the host its `devicePixelRatio`; the host advertises
   `wl_output` scale as its ceiling (an integer scale), and clients draw
   buffers at that scale.
2. The tab draws each frame at device pixels, so one buffer pixel is one
   screen pixel; window sizes in CSS pixels don't change.
3. When the ratio changes (the window moves to another screen, or the page
   zooms), the scale follows.
4. Note in the outcome what scale 2 costs in frame bytes against scale 1,
   from one short run; that feeds brief 36 (lossy video regions).

## Must preserve

- Scale 1 screens look and cost exactly as today.
- Input coordinates: clicks land where they did, at every scale.

## Acceptance

- In Chromium with `deviceScaleFactor: 2`, Firefox's text in a Linux window
  is as sharp as the desktop's own text in a screenshot, and clicks still
  hit their targets.
- Tests for the scale message and the coordinate maths pass, with
  `cargo test` for the host.

## Files you OWN

- `apps/wayland-host/src/` (output scale, buffer scale)
- `apps/wayland-host/PROTOCOL.md`
- `apps/core/src/modules/linux-windows/` (sending the ratio, drawing frames)
