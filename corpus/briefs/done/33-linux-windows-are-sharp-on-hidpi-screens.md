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

## Outcome (2026-11-06)

Done in `26dc24e` (1.161.0). Ready for deploy on the board.

1. **The ratio and the scale.** The tab sends `window.devicePixelRatio` as
   `ratio`: in the `/api/wayland` URL and with every `viewport` message, which
   goes on a resize and when a `(resolution: <n>dppx)` media query stops
   matching (another screen, a page zoom). The backend clamps it (0 to 8,
   else 1) and passes it in `session_open` and `output` (protocol 6). The host
   makes its ceiling the output's scale, 1 to 4, with a hundredth's slack for
   float noise, and the mode in device pixels. Apps hear it three ways, each
   sent once per value: every surface enters the output (`wl_surface.enter`,
   which GTK reads; nothing sent it before), the preferred buffer scale
   (`wl_surface` 6), and the fractional scale's preferred scale, now the same
   whole number instead of 1.0. A scale change makes every window's surfaces
   leave the output and enter it again.
2. **Buffer pixels against surface coordinates.** A surface's size in surface
   coordinates is its viewport's destination, else its buffer over its buffer
   scale; a viewport's crop is still not applied. Surface damage is mapped to
   buffer pixels (it was read as buffer pixels, harmless at scale 1). A
   window's `scale` is its root buffer's pixels per surface coordinate
   (rounded, 1 to 4), its canvas is its size times that, and a subsurface at
   another scale is resampled to it, nearest pixel. Every coordinate in the
   protocol stays in surface coordinates, which are CSS pixels; only frames
   are in image pixels. Toplevel and popup messages carry `scale` and their
   `width` and `height` are now in surface coordinates.
3. **The tab** sets each canvas's CSS size to the frame's pixels over the
   window's scale, on every frame, so a window keeps its CSS size, its input
   maths is unchanged (the CSS offset from the canvas), and one image pixel
   is one device pixel on a ratio-2 screen. At scale 1 everything is as
   before, byte for byte.
4. **What scale 2 costs** (one short run, for brief 36): five PageDowns in
   Firefox on a text page, a 1256×562 CSS window, lossless WebP. Scale 1 sent
   55 frames, 2.81 and 2.88 MB in two runs; scale 2 sent 42 frames, 5.11 and
   5.14 MB. About 1.8 times the bytes, 2.4 times per frame, and a quarter
   fewer frames (Firefox draws four times the pixels, and acks pace it).
   Scale 3, a phone at a ratio of about 2.6 to 3, is nine times the pixels of
   scale 1 in frames and in buffer memory; the owner was asked on the board
   whether to cap the scale at 2.
5. **X11 apps stay at scale 1.** Rootless Xwayland without `-hidpi` draws at
   1, so an X11 window has `scale` 1 and the tab enlarges it, soft as before.

**Checked:**
- `cargo test` for the host in the cached `rust:1.97-alpine` container: 36
  pass, 5 new (the ceiling, surface sizes, window scales, mapping rectangles
  between scales, a lower-scale surface drawn larger); the fixtures were
  regenerated for protocol 6.
- Backend jest `src/modules/wayland`: 31 pass (the ratio through the
  upgrade, `viewport` and a resume, clamped; the fixtures with `scale`).
- Core vitest `src/modules/linux-windows`: 43 pass (a scale-2 frame laid out
  at half its pixels, a broken scale read as 1, the pointer landing at the
  CSS offset whatever the canvas's pixels).
- `tsc` for core and backend; eslint and prettier on the touched folders.
- Walked in the dev container, headless Chrome at deviceScaleFactor 2, the
  new host binary copied in: Firefox announced `scale: 2` and its canvas held
  2512×1124 pixels at 1256×562 CSS; at native pixels its text was as sharp as
  the desktop's labels; a real mouse click on its "Not now" button closed the
  dialog, and its menu button opened the menu, a popup at scale 2 placed
  under the button; typed keys loaded `about:license`. Switching the browser
  to ratio 1 (with a one-pixel resize) redrew Firefox at scale 1, and back to
  2 at scale 2. XTerm opened at scale 1 at its normal size.
- Not checked: a real HiDPI screen, and the media-query path for a ratio
  change with no resize (headless emulation fires no media-query change
  event). The owner's check after the deploy covers both.

Walk notes: Chrome's emulated deviceScaleFactor turns `mouse wheel` steps
into deltas that aren't whole notches, so the measurement used PageDown key
events through CDP. A focus click in the page followed a link, so the
measured page was Firefox's source docs, the same page at both scales.
