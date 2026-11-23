---
summary: Brief 115's measurement (2026-11-23). foot's keystroke-to-frame p95 rises 17 to 18 ms (VP8) and 24 to 33 ms (JPEG) while a 720p clip plays in another Linux window, past the 16 ms that called for an encoder thread. A control run (the clip decoded with no window) shows no rise, and the tab makes no long tasks, so the clip's frame pipeline is the cause; but the brief's single encoder thread would queue foot's frame behind the clip's, and on one CPU can at best take one encode (9 to 10 ms) off the wait, under half the gap. Measured, not built.
updated: 2026-11-23
---

# An encoder thread for the Wayland host: measured

The host encodes every window's frames (lossless WebP, JPEG, VP8) inline on its one event-loop thread, so a
key or a buffer release can wait behind an encode. Brief 115 wrote the bars first
([how-we-measure.md](how-we-measure.md), rule 1): build an encoder thread only if foot's keystroke-to-frame p95
with a video playing is more than 16 ms above its p95 alone; keep it only if the gap then closes by at least
half and host CPU per video frame rises by no more than 5%.

**Verdict: measured, not built.** The first bar fired; the design the brief drew can't clear the second, by
the numbers below.

## Method

- **Where.** A host machine, not the dev container (Docker's daemon was down): 4 vCPU Xeon at 2.3 GHz. The
  backend, the release-built host it starts (`WAYLAND_HOST_BIN`) and every Linux app it runs were pinned to one
  CPU with `taskset -c 0`, as production's cap pins the whole container. Headless Chromium at 1920 by 1080.
- **The apps.** foot 1.16 (Ubuntu) running `sh`, typed into; and brief 89's clip (ffmpeg's `testsrc2`, 1280×720,
  30 frames a second, made with the command on
  [research-video-in-linux-windows.md](research-video-in-linux-windows.md); ffmpeg 6.1.1 here, so its sha256 is
  `93c6b757…0b191`, not that page's) played by mpv 0.37 with `--vo=wlshm --loop=inf` in a second window.
  Firefox from Nix wasn't available; mpv's output is the same kind of shared-memory window.
- **The measure.** 50 keys into foot, 150 ms apart, from the page's keydown to the first frame message for
  foot's toplevel on the Linux windows socket; median and p95. Then the same with the clip playing. The VP8
  path is the tab's own; for JPEG the page has no `VideoDecoder`, so the tab asks for no codec.
- **Host CPU** is the host process's `utime + stime` over the run, per clip frame the tab received.

## The numbers

| | foot alone, median (p95) | beside the clip, median (p95) | p95 gap | Clip in the tab | Host CPU |
|---|---:|---:|---:|---:|---:|
| VP8, run 1 | 18.6 (33.2) ms | 30.8 (52.6) ms | +19.4 ms | 24.5 frames/s | 21%, 8.4 ms a frame |
| VP8, run 2 | 19.2 (34.5) ms | 33.8 (51.6) ms | +17.1 ms | 24.7 frames/s | 21%, 8.5 ms a frame |
| VP8, run 3 | 19.7 (34.8) ms | 33.0 (52.2) ms | +17.4 ms | 24.5 frames/s | 22%, 8.8 ms a frame |
| JPEG, run 1 | 18.6 (33.2) ms | 33.8 (58.8) ms | +25.6 ms | 23.6 frames/s | 23%, 9.8 ms a frame |
| JPEG, run 2 | 17.5 (34.1) ms | 33.4 (66.8) ms | +32.7 ms | 23.4 frames/s | 24%, 10.4 ms a frame |
| JPEG, run 3 | 18.2 (33.4) ms | 34.5 (57.6) ms | +24.2 ms | 23.4 frames/s | 24%, 10.1 ms a frame |
| Control: clip decoded, no window (`--vo=null`) | 17.3 (33.9), 17.2 (34.6) ms | 19.1 (34.5), 20.5 (34.7) ms | +0.6, +0.1 ms | none | |

The tab made no long task in any run.

## Why it stops here

- **The cause is the clip's frames, not its decoding.** With the clip decoded and nothing shown, foot's p95
  doesn't move; the page's main thread never blocks for 50 ms. What the visible clip adds on the one CPU is
  mpv's conversion into shared memory, the host's encode of each frame (8.4 to 10.4 ms) and the backend's
  relay, about 24 times a second.
- **The brief's thread can't clear decision 3.** One encoder thread, fed in order, takes the encode off the
  event loop, so the key reaches foot sooner; but foot's own frame then queues on that thread behind the clip
  frame it is encoding. On one CPU a thread adds no capacity, so the most it removes from foot's wait is about
  one encode: 8.4 to 10.4 ms against gaps of 17 to 19 ms (VP8) and 24 to 33 ms (JPEG). Half the gap is 8.6 to 9.7
  ms for VP8 (at the edge, before foot's own queueing) and 12 to 16 ms for JPEG (out of reach).
- **What could:** encoding a small, typed-into window ahead of a video window (a second encoder, or a priority
  in the queue), so foot's frame never waits behind the clip's. That is a different design with its own bar,
  not filed. Or the cap: on two CPUs the same thread would add capacity, but production has one.
