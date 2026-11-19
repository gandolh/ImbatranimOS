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

## Outcome (2026-11-19)

Built: VP8 qualified and ships. Ready for deploy: `node cli.ts imbatranim-os
server` from vps-deploy (the Dockerfile changed, so the image rebuilds). Built
2026-11-17 in `8cfc82d` (1.337.0) and `dc44f38` (1.338.0, the research page),
both pushed by the owner; a fix round on 2026-11-19 after review in `fc1a118`,
`6bd539c`, `fe878d1` and `27583a7` (1.340.0 to 1.343.0), local.

**The numbers** ([research-video-in-linux-windows.md](../../wiki/research-video-in-linux-windows.md)).
Offline, one CPU, at JPEG's look: H.264 and VP8 both about 20 kB a frame
against JPEG's 55.8 kB (37%), at about JPEG's CPU a frame; a tie, so VP8 by
decision 2. In the real pipeline (Firefox playing the 720p clip, the dev
container on one core), three alternating runs: VP8 518 kB/s against JPEG's
1 135 (46%), host CPU 23.4% against 31.1% of a core (75%), at a slightly
higher frame rate.

**What shipped.** The host encodes the region that went lossy as VP8 (libvpx
1.15 through a C shim, `src/video.rs`, `csrc/vp8.c`; encoding 4, protocol
version 10) for a tab that says on connect it decodes VP8, rounded down to an
even size; text beside it and the settle frame stay lossless. A stream starts
with a keyframe and restarts on a move or resize, after it settles, on resync
and on the tab's keyframe request. Its bitrate is 0.2 bits a pixel a frame at
the window's frame rate, scaled down while acks come back slowly. The tab
decodes with WebCodecs' `VideoDecoder`, one per window; a tab without it
asks for nothing and gets JPEG.

**The fix round (2026-11-19).** Review found three gaps.

- *Colours.* Chrome decoded the host's BT.601 limited-range YUV as BT.709:
  the colour bars' green came out (0,181,2) against lossless (0,215,0). The
  tab's decoder config now names the colour space: primaries `bt709` and
  transfer `iec61966-2-1` (the pixels are sRGB), matrix `smpte170m`, limited
  range. WebCodecs has a config's colour space override the frames', and VP8
  frames carry none. Six bars in Chrome, at the first walk's spot (each
  bar's centre column), each the most common colour down y 110 to 400, which
  the moving band and squares can't sway:

  | Bar | Lossless (paused) | VP8 before | VP8 now | JPEG |
  |---|---|---|---|---|
  | red | 255,24,0 | 255,46,1 | 255,25,1 | 254,24,0 |
  | green | 0,215,0 | 0,181,2 | 0,214,2 | 0,215,0 |
  | yellow | 255,241,0 | 255,229,2 | 254,241,2 | 255,241,0 |
  | blue | 0,14,255 | 0,26,253 | 1,14,253 | 0,14,255 |
  | magenta | 255,39,255 | 255,73,252 | 254,40,252 | 254,39,255 |
  | cyan | 0,229,255 | 0,207,253 | 0,228,253 | 0,229,255 |

  VP8 is now within 3 of lossless on every channel (was up to 34). The
  all-`smpte170m` variant drew the same in Chrome; the sRGB one is kept
  because it says what the pixels are, so a browser that manages colour has
  nothing else to convert. Firefox 159, given the host's own keyframe, drew
  it right with the config and without it. Android Chrome runs Chrome's
  WebCodecs, which applies the config; not tried on a phone.
- *A decoder that keeps failing.* It asked for keyframes forever and painted
  nothing. Now the third failure (an error, a throw, a decode stalled past
  1 s, or a config the browser refuses) within 10 s, on any of the tab's
  windows, gives VP8 up: one failure is normal (a hidden tab's decoder taken
  back), three in 10 s mean the keyframes don't decode either, and even a
  stalled decoder on a link a few seconds slow fails three times inside the
  window. The tab reconnects without codecs for as long as the page lasts;
  the backend takes the session back as after a reload, and its resync
  carries the empty codec list to the host, which sends JPEG. No backend or
  host change. Walked with every `decode()` made to throw: three VP8
  keyframes, two keyframe asks, the new socket 82 ms after the first
  failure, then 421 JPEG frames in the next 22 s and no more VP8; the window
  came back where it was.
- *The connect URL* had no test; `connection.test.ts` covers it with and
  without codecs, and the fallback's reconnect.

**Walked** in `infrastructure-dev-1` (the 2026-11-17 host binary, the tab's
source synced in), headless Chrome at 1920×1080, Firefox maximized playing
the clip beside text: VP8 playing with the text lossless, the pause ending
sharp, the codec turned off and the forced decoder failures both playing as
JPEG. A resize mid-play restarted from a keyframe on 2026-11-17.

**Deviations.**

- The 1 GiB memory cap was never applied: Docker can't take a memory limit
  off a container again without recreating it, and the dev container must not
  be recreated. The CPU was capped to one core. Its `memory.current`, 1.37 to
  1.98 GiB, was the whole dev container with its dev servers, not comparable
  to production.
- H.264 was measured offline only, where it tied with VP8; the real-pipeline
  runs compare JPEG and VP8.
- Outside the brief's files: the backend's wayland module (the codec list and
  the keyframe message to the host) and `infrastructure/Dockerfile` (libvpx),
  which the codec list and the library needed. The fix round touched the host
  only for a comment (`27583a7`).

**Checks.** `npm run check` exit 0 at 1.343.0 (core vitest 817, backend jest
1 099 with the archive spec, backend e2e 223); `bash corpus/lint.sh` clean;
host `cargo test --locked` 105 + 1 passed (the controller, on `8cfc82d`). The
archive spec `archive.compressed-file.spec.ts` failed under load on
2026-11-17 and passes alone; a todo looks into it.

**Owner steps.** Deploy as above. Then on the box, from Android Chrome, play
a 720p video in a Linux app: its colours match the paused frame, and if the
phone can't decode VP8 the region falls back to JPEG (the Linux windows blink
once as the tab reconnects). Check the container's memory stays under its
1 GiB cap while it plays.
