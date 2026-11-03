# Brief 36 — Video regions go lossy, and text stays sharp

## Context

Found while building the Linux apps layer (2026-11-03, brief 04's table).
Firefox playing a synthetic 480 px video cost 239 kB/s in lossless WebP at
28 frames a second; a real film would cost several times that, more on a
HiDPI screen (brief 33). The owner's direction on 2026-11-03: send large,
fast-changing regions lossy, keep text sharp, with 04's table as the
baseline. Split out of the todo `linux-apps-after-the-first-wave` with the
owner on 2026-11-03.

## Spec

1. In the host's frame encoder (`apps/wayland-host/src/pixels.rs`), detect
   a region that is large and changes on most frames (a video, an
   animation), and send it lossy; everything else stays lossless. Define
   "large" and "most frames" as constants with a comment on why.
2. When the region stops changing, send it lossless once, so a paused video
   frame ends up sharp.
3. The tab draws both kinds the same way (`apps/core/src/modules/linux-windows/frames.ts`).
4. Describe the rule in `apps/wayland-host/PROTOCOL.md` if a message
   changes.

## Must preserve

- Text and UI in a window that isn't playing anything are lossless, byte
  for byte as today.

## Acceptance

- Tests (`cargo test`) cover the region rule: a static frame stays
  lossless; a large region changing every frame goes lossy; it returns to
  lossless once it stops.
- One run of 04's setup (Firefox, the same synthetic 480 px video) on a
  quiet machine, with its kB/s beside 04's 239 kB/s in the outcome. If the
  machine is busy, skip the run, leave the number to the owner, and say so.

## Files you OWN

- `apps/wayland-host/src/pixels.rs` (and the session code that calls it)
- `apps/wayland-host/PROTOCOL.md`
- `apps/core/src/modules/linux-windows/frames.ts`
