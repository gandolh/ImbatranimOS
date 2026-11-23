---
summary: Rounds 6-10 of the 2026-11-23 performance sweep in full. Round 6 caps the backend's young generation (--max-semi-space-size=2 in the image's CMD), 159 to 118 MiB after 18,000 requests with the same CPU. Round 7 moves a dragged window with CSS translate (a File Manager drag 351 to 114 ms of main thread) and drops @use-gesture.
updated: 2026-11-23
---

# The performance sweep, rounds 6-10

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).

## Round 6 (2026-11-23): the backend's memory

**Method.** The production build (`node apps/backend/dist/main`, as the image runs it) on a quiet machine: RSS from
`/proc/<pid>/status` ten seconds after start and after 18,000 sequential authenticated requests (`/api/system/stats`
and `/api/prefs`, three runs of 3,000 each) with their CPU per request from `/proc/<pid>/stat`; then a 20 MB `cat`
through a Terminal and 30 wheel notches through foot, three runs each, for the backend's CPU under a flood.

**What the memory is.** Fresh, the backend holds 119 MiB: 63 MiB anonymous (the heaps), 56 MiB of mapped files
(Node and the native modules). The V8 heap is 28 MiB, 11 MiB of it the source text of loaded modules (Nest,
class-validator, zod and Node's own). Under load it grew to 159 MiB and kept it: V8 sizes the young generation
(three semi-spaces, Node's [memory guide](https://nodejs.org/learn/diagnostics/memory/understanding-and-tuning-memory))
from the heap limit, grows it to tens of MiB and doesn't give it back.

| After 18,000 requests | RSS | CPU per request, stats / prefs |
|---|---:|---:|
| V8's defaults | 159 MiB | 1.2-1.3 / 0.35-0.43 ms |
| `--max-semi-space-size=1` | 121 MiB | the same |
| `--max-semi-space-size=2` | 118 MiB | the same |
| `--max-semi-space-size=4` | 123 MiB | the same |
| `--optimize-for-size` | 117 MiB | the same |

Under floods the 2 MiB cap cost nothing measurable: a 20 MB `cat` took 490 ms of backend CPU against 460 (median of
three, the runs spread from 380 to 580), and 30 wheel notches through foot 40 ms either way.

- **The image's CMD runs the backend with `--max-semi-space-size=2`.** Not in `NODE_OPTIONS`: a Terminal's shell
  inherits the backend's environment, and the owner's own Node programs keep V8's defaults. `--optimize-for-size`
  saved the same but changes many heuristics at once.

**Looked at and left in round 6:**

- **Bundling and minifying the backend** would shrink the 11 MiB of module source, but Nest's decorators and the
  native modules make it a build change of its own.
- **`--v8-pool-size=1`** saved 3 MiB.

## Round 7 (2026-11-23): dragging a window

**Method.** `drag.mjs`: open an app, press its title bar, move the pointer 60 times (5 px across and 2 down each),
and read Chromium's `Performance.getMetrics` and the React commit count across the moves; three runs, each from
where the last left the window, median. The first cut of the script measured the window's place once, so runs 2 and
3 pressed the bare desktop and drew marquees; the numbers below are from the fixed script, the old code built into
a scratch directory and served the same way.

| 60 moves, median of 3 | Before | After |
|---|---:|---:|
| File Manager: main thread / script / layouts / commits | 351 ms / 195 ms / 120 / 60 | 114 ms / 8 ms / 0 / 0 |
| Terminal | 329 ms | 108 ms |
| Calculator | 336 ms | 114 ms |

- **The frame moves with CSS `translate` while the pointer does**, on the compositor; the store gets the position
  once, on release, and a layout effect takes the shift off when React has drawn the window there. `translate`
  rather than `transform`, which framer-motion owns for the open and close scale. The Linux window body reports
  its place from the store, so the host hears it on release; its popups close when a drag starts anyway.
- **Plain pointer events** for the title bar and the resize handles, with the same 3 px threshold as
  @use-gesture's tap filter, which is removed (20 KiB of the first page load: 913 to 895 KiB).
- Walked on both builds alike: snap to an edge, unsnap by dragging, edge resizes, maximize and restore,
  double-click, close.

**Looked at and left in round 7:** resizing still writes the size every move, which lays the app out each time;
that is what resizing is. A press 4 px inside a window's bottom-right corner resized nothing on the old build or
the new one.
