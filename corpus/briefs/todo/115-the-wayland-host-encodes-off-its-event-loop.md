# Brief 115: The Wayland host encodes off its event loop, measured

**Depends on:** 101 (workloads and runner), 112 (the host's rules). **Runs after:** 114.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 8.

## Context

- The host runs one calloop thread for every session. Its only
  `thread::spawn` calls write pastes (`apps/wayland-host/src/session.rs`).
  Lossless WebP, JPEG and VP8 encoding run inline on that thread, about 9 to
  10 ms of CPU per 720p video frame
  ([research-video-in-linux-windows.md](../../wiki/research-video-in-linux-windows.md)).
  While an encode runs, a key, a pointer event or a buffer release from
  another window waits.
- Ghostty 1.4 moved every OpenGL call off the GTK main thread, and drains the
  pty on one thread while parsing on another, for the same reason: nothing
  slow sits in front of input.
- Under the production cap (one CPU) a thread adds no capacity. It can only
  change who waits. One frame per window is in flight (the tab acks each), and
  that stays.
- Keystroke-to-frame was measured on 2026-11-06 (xterm 20 ms median, 39 ms
  p95, locally;
  [research-native-apps-via-wayland-measured.md](../../wiki/research-native-apps-via-wayland-measured.md)).

## Decisions (the bar, written before measuring)

1. **Measure first**, in the dev container under the cap: keystroke to frame
   for foot in one window (median and p95, 50 keys), alone, and while brief
   89's 720p clip plays in Firefox in a second window, once on the VP8 path
   and once on JPEG.
2. **Build only if** p95 with the video playing is more than 16 ms (one frame
   at 60 Hz) above p95 alone. Then: an encoder thread fed copies of the
   damaged rectangles over a channel, results back through a calloop channel,
   frame order per window kept, one frame in flight kept.
3. **Keep it only if** the p95 gap closes by at least half and host CPU per
   video frame rises by no more than 5%. Otherwise revert, write the numbers,
   close as measured, not built.
4. No protocol change.

## Files you OWN

- `apps/wayland-host/src/` (`session.rs`, `pixels.rs`, `video.rs`, a new
  encoder module, tests).
- Corpus: the numbers in `wiki/research-video-in-linux-windows.md` or a new
  research page, `wiki/status-linux-apps-layer.md` (a line), `log.md`.

## What to do

1. The measurement in decision 1, with the method, so it can be redone.
2. Only if decision 2 says so: the thread, tests that frames for one window
   arrive in order and that a window closed mid-encode drops its result, then
   the measurement again.
3. Keep or revert by decision 3.

## Acceptance

- [ ] The numbers are written down with the cap and the method.
- [ ] If built and kept: the bar holds and the host's tests pass. If not: the
  outcome note says why.
- [ ] `bash corpus/lint.sh` OK; `npm run check` exit 0 if anything outside
  the host changed.
- [ ] End move `ready_for_deploy` if kept (owner step
  `node cli.ts imbatranim-os server`), else `done`.
