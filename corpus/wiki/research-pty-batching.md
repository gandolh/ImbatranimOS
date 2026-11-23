---
summary: Brief 114's measurement (2026-11-23). Batching the Terminal's PTY output into frames of up to 64 KiB or 4 ms (Ghostty's read-thread rule) cut WebSocket frames about 15 times, but drain time rose 7% and 12% and backend CPU 32% and 22%, so the bar (a 15% drop in either) fails. Linux's node-pty already reads 4 KiB at a time. Measured, not built.
updated: 2026-11-23
---

# Batching PTY output: measured

`apps/backend/src/modules/pty/pty-session.ts` sends one WebSocket frame per node-pty data event. Ghostty 1.4
gained 25% to 55% on macOS, where a pty read gives about 1 KiB, by gathering reads before parsing. Brief 114
wrote the bar first ([how-we-measure.md](how-we-measure.md), rule 1): keep the rule only if drain time or
backend CPU drops at least 15% and keystroke p95 moves by under 1 ms.

**Verdict: measured, not built.** Neither drain time nor backend CPU dropped; both rose.

## The rule tried

A chunk under 1 KiB with nothing gathered goes out at once (typing's echo); otherwise chunks gather until
64 KiB or 4 ms, whichever comes first, then go as one frame. Backpressure unchanged; what gathered goes before
the exit notice, and a detach drops it (it is in the ring). It passed its specs (an echo at once, a flood in
64 KiB frames within 4 ms) and was reverted after the measurement.

## Method

- **Where.** A host machine, not the dev container (Docker's daemon was down): 4 vCPU Xeon at 2.3 GHz, the
  backend pinned to one CPU with `taskset -c 0` (how-we-measure.md's pinned row), BusyBox ash as the shell,
  headless Chromium at 1280 by 800 with the DOM renderer.
- **Drain, frames and bytes.** Brief 101's runner (two warmups, ten runs) with a scratch workload that runs a
  command, finds its end marker in xterm's buffer and stops at the render that shows it, counting the socket's
  messages and bytes in the page. Two commands: `cat` of the 50 MB plain input, and `yes | head -c 50M`.
- **Backend CPU.** The backend process's user and system time from `/proc/<pid>/stat` around the twelve runs,
  divided by twelve.
- **Keystroke.** 50 keys at an idle prompt, from keydown to xterm's first render after the echo.

## The numbers

| | One frame per read | Batched (64 KiB / 4 ms) | Change |
|---|---:|---:|---:|
| 50 MB `cat`: drain median (p95) | 1,917 ms (2,901) | 2,053 ms (2,601) | +7% |
| 50 MB `cat`: frames a second, bytes a frame | 6,503, 4,093 B | 433, 59,572 B | 15× fewer frames |
| 50 MB `cat`: backend CPU a run | 407 ms | 538 ms | +32% |
| `yes \| head -c 50M`: drain median (p95) | 12,000 ms (13,133) | 13,449 ms (15,149) | +12% |
| `yes \| head -c 50M`: frames a second, bytes a frame | 2,511, 2,560 B | 234, 24,927 B | 11× fewer frames |
| `yes \| head -c 50M`: backend CPU a run | 4,899 ms | 5,992 ms | +22% |
| Keystroke to echo, median (p95) | 26.8 (35.4) ms | 26.0 (34.0) ms | p95 −1.4 ms |

Linux's node-pty already hands over about 4 KiB a read, four times macOS's, so there were fewer frames to save
than Ghostty had; joining the strings for each frame cost more CPU than the frames saved. The `yes` pipeline
is slow either way (12 s for 50 MB): its cost is in the shell's pipe and the pty, not in the frames.

## What would change the call

- A cheaper gather: sending node-pty's chunks as one frame without joining them (a binary frame built from
  buffers) could keep the frame savings without the CPU. Not filed; it needs its own bar.
- The tab's side: 15 times fewer `message` events could matter to a slow phone's main thread, which this page
  didn't measure.
