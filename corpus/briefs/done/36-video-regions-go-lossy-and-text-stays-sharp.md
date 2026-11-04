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

## Outcome (2026-11-04)

**Built in `6b00b3d` (version 1.134.0).**
1. **The rule** (`pixels.rs`, constants with their reasons): "large" is at
   least 240×135 pixels; "most frames" is six of the window's last eight; a
   redraw covering half the region counts as the region, and one at most 1.5×
   its size moves or grows it (a scrolled video), while a larger one is the
   region merged with other damage and leaves its bounds alone. Only the
   region goes lossy: a merged rectangle is split, and the rest of it goes out
   as lossless WebP. A region with any transparent pixel stays lossless, and
   only the WebP path does any of this; deflate is unchanged. A side effect to
   know: a window scrolled continuously for more than six frames goes lossy
   in its scrolled area until it stops.
2. **Settling:** the host's 33 ms frame clock ticks every window's canvas;
   eight ticks after a lossy region's last change it is damaged once more and
   sent lossless, then forgotten, so the next play starts lossless.
3. **The tab** decodes encoding 3 as `image/jpeg` through `createImageBitmap`
   and draws it as it draws WebP (`frames.ts`). `PROTOCOL.md` documents the
   encoding and the rule.
4. **The encoder** is `jpeg-encoder` 0.7.1, pure Rust with no dependencies of
   its own, at quality 80: `image-webp` encodes losslessly only, and lossy
   WebP would have meant libwebp's C build. The host's release binary still
   builds with `--locked`.

**Checked:**
- `cargo test` (19): a typing window and an occasional large redraw stay
  lossless, byte for byte equal to `webp_lossless` of the same pixels; a
  480×270 region redrawn every frame goes JPEG from the sixth frame and is
  smaller than its lossless WebP; text merged with it stays lossless and the
  pieces cover the rectangle exactly; a still region is sent lossless once
  after eight ticks, then nothing, and a new play starts lossless;
  transparency and deflate stay lossless; the rectangle arithmetic.
- Core: the tab decodes JPEG and WebP and refuses an unknown encoding.
- **Not run:** the Firefox measurement against brief 04's 239 kB/s. The owner
  asked to wrap the session up before it; the number is the owner's.
