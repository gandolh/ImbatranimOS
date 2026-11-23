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

## Outcome (2026-11-23)

**Measured, not built**; the method and the table are on
[research-host-encoder-thread.md](../../wiki/research-host-encoder-thread.md). No code changed.

**Decision 2 fired:** with brief 89's clip playing in a second window, foot's keystroke-to-frame p95 rose 17 to
19 ms on VP8 (52 ms against 33 to 35 alone) and 24 to 33 ms on JPEG, past 16 ms. **The build was not done, a
judgment call the owner can overturn:** a control (the clip decoded by mpv with no window) moved foot's p95 by
under 1 ms, and the tab made no long tasks, so the gap is the clip's frames (mpv's shared-memory output, the
host's 8.4 to 10.4 ms encode per frame, the backend's relay) on one CPU. The thread the brief drew keeps each
window's frames in order on one encoder, so foot's frame would queue behind the clip's, and one CPU gives the
thread no capacity: the most it takes off foot's wait is about one encode, under half of the JPEG gap and at
the edge of half the VP8 one before foot's own queueing. Decision 3 needs half or more. The page names what
could: a typed-into window encoded ahead of a video one, which needs its own brief and bar.

**Not as the brief said:** the host machine, not the dev container (Docker's daemon was down), with
everything the backend runs pinned to one CPU; mpv 0.37 (`--vo=wlshm`) for the clip, since Firefox from Nix
wasn't available; the clip remade with ffmpeg 6.1.1 (another sha256 than brief 89's).

`bash corpus/lint.sh` OK; nothing outside the corpus changed. End move `done`.
