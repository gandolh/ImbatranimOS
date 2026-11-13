# Task 89: Video in a Linux window goes as a video stream

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-13 from the owner's grill on the self-hosted tools research
in vps-deploy (`corpus/wiki/self-hosted-tools-adopt-or-borrow.md`, the
RustDesk section). The owner asked for this as a brief now, not a backlog
todo.

## Context

- The Wayland host sends each window's damage as rectangles: deflate RGBA
  or lossless WebP. A region redrawn on most frames (at least 240×135, in 6
  of the window's last 8 frames: a video) goes as JPEG at quality 80, and
  once more lossless when it has been still for about a quarter of a second
  (`apps/wayland-host/src/pixels.rs`, the `LOSSY_*` constants).
- One frame per window is in flight. The host holds the app's frame
  callbacks until the tab acks (`session.rs`, `ack`), so a slow link lowers
  the frame rate. The JPEG quality never changes.
- Every JPEG is a whole picture. A video codec sends mostly the difference
  from the previous frame, which is usually far smaller at the same look.
  RustDesk streams its screens that way (VP8, VP9, AV1 or H.264) and lowers
  the bitrate when the link slows. How much smaller it is here has to be
  measured, not assumed.
- imbatranim-os runs on the VPS capped at 1 GiB and one CPU (vps-deploy
  brief 16). Firefox decoding a video and the host encoding it share that
  CPU, so CPU per frame matters as much as bytes.
- The tab would decode with WebCodecs' `VideoDecoder` onto the window's
  canvas. Support differs by browser and version; Android Chrome is the
  main phone.

## Owner decisions

Settled 2026-11-13: build it now. The rest are technical defaults, decided
by convention; record any change on the ticket.

1. **Measure first.** One fixed 720p clip played in Firefox in a window, in
   the dev container under the production cap (1 GiB, one CPU). Record
   bytes per second and host CPU for today's JPEG path, H.264 (openh264)
   and VP8 (libvpx). Ship a codec only if it at least halves the bytes at
   no more host CPU than JPEG. If none does, stop: the numbers go in the
   wiki and the brief closes as measured, not built.
2. **Which codec.** The one the numbers pick. On a tie, VP8: it is
   royalty-free when built from source, and H.264 from source is not.
   AV1 is left out; software encoding is too slow for one CPU.
3. **Only video regions.** The codec replaces JPEG for the regions that go
   lossy today, nothing else. Text and UI stay lossless, and the lossless
   frame after a video settles stays.
4. **Fallback.** The tab says on connect which codecs it can decode. A tab
   that can't decode the codec gets JPEG as today.
5. **Bitrate follows the link.** The encoder's bitrate drops when acks come
   back slower and climbs back when they speed up. One frame in flight
   stays the rule.
6. **A moved or resized region** restarts its stream with a keyframe.

## Files you OWN

- `apps/wayland-host/src/`: `pixels.rs`, `protocol.rs`, a new video
  encoder module, and their tests
- `apps/wayland-host/` build files, for the codec library (Alpine package
  or Nix, whichever the host already uses for native deps)
- `apps/core/src/modules/linux-windows/`: `frames.ts`, `connection.ts` and
  their tests
- `corpus/wiki/`: a new `research-video-in-linux-windows.md`, and the
  Linux apps status line

## Files you must NOT touch

- Other repos (vps-deploy's cap stays as it is)
- The lossless paths' encodings and the `LOSSY_*` detection, beyond what
  routing a region to the codec needs

## What to do

1. Measure as in decision 1, in the dev container (reuse
   `infrastructure-dev-1` and its Nix volume; rebuild only when the host's
   deps change). Write the method and numbers into the research page. The
   codec library is a new dependency, and these numbers are its reason
   ("lightweight is identity").
2. If a codec qualifies: the encoder for lossy regions, a new encoding id
   in the protocol, the tab's codec list on connect, the decoder in
   `frames.ts`, keyframes on region change, bitrate from ack timing.
3. Walk it in the dev container: a 720p video in Firefox; text beside it;
   pause (ends sharp); resize mid-play; a desktop tab and an Android Chrome
   tab; a tab with the codec turned off falls back to JPEG.
4. Bump the version and commit by the repo's rules.

## Acceptance

- The research page holds bytes per second and host CPU for JPEG and both
  codecs, same clip, same cap.
- If built: a playing 720p video costs at most half of JPEG's bytes per
  second at no more host CPU, looks no worse, text beside it stays
  lossless, a paused video ends sharp, and a tab that can't decode the
  codec still gets JPEG.
- If not built: the brief's outcome note says why, with the numbers.
- The host's and core's tests pass, and typecheck is clean.
