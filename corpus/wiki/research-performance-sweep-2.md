---
summary: Rounds 6-10 of the 2026-11-23 performance sweep in full. Round 6 caps the backend's young generation (--max-semi-space-size=2 in the image's CMD), 159 to 118 MiB after 18,000 requests with the same CPU. Round 7 moves a dragged window with CSS translate (a File Manager drag 351 to 114 ms of main thread) and drops @use-gesture. Round 8 stops the Wayland host's frame clock while it has nothing to do (idle host CPU to zero) and sends the first frame after a rest at once (foot's keystroke to frame 20 to 5 ms). Round 9 loads Notepad's Markdown preview and highlighter only for Markdown (Notepad's chunk 366 to 42 KB). Round 10 prunes what no runtime reads from the image's node_modules (its layer 57 to 30 MB).
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

## Round 8 (2026-11-23): the Wayland host at rest

**What a signed-in tab costs before any Linux app.** One tab opens its Linux windows socket at sign-in, and the
backend starts the session's share of the host: a socket, a session bus (`dbus-daemon`, 4.2 MiB) and a sound
server inside the host, which is 6 MiB resident in all. Small; but the host's frame clock ticked every 33 ms
whatever it had to do: 40 to 50 ms of CPU every 20 s with nothing on screen, 30 wakeups a second on a vCPU that
could rest. And a keystroke's echo, committed between ticks, waited for the next one.

- **The clock runs only while there is work** (`SessionState::wants_tick`: a frame to send from a live window, a
  callback it could answer, a lossy region counting its quiet ticks, a client gone to drop; or output the control
  socket didn't take), the way the sound clock already did. Started after a rest of a tick or more it ticks at
  once, otherwise after the rest of the 33 ms, so a window still gets at most one frame every 33 ms.
- **A trap the end-to-end tests caught:** `hello`, sent before the loop, was only ever written by the first tick's
  round of events; now it is written at start. The same reliance covered a socket that refused output, so unsent
  output keeps the clock running.

| foot in a real tab, this machine's glibc build | Before | After |
|---|---:|---:|
| Host CPU over 20 s idle, empty desktop / foot open | 40-50 ms / 50 ms | 0 / 0 |
| Keystroke to frame (40 keys): median / p95 | 20.4 / 37 ms | 5.0 / 6-8 ms |
| Wheel, slow output, typing, weston-terminal | | the same frames and bytes; typing's host CPU 30 to 20 ms |

**Looked at and left in round 8:** starting the host and the session bus only when a Linux app opens. A Terminal's
shell gets `WAYLAND_DISPLAY` at once, and an app started there must find the socket; at 10 MiB and no CPU at
rest, the session isn't worth that.

## Round 9 (2026-11-23): what an app downloads when it opens

**Where.** At sign-in the desktop makes 15 API requests (about 10 KB), so that was left. The first page load's shell
surfaces that open later (Start, the palette, the panels, the Linux window body) are about 51 KiB of its own code,
perhaps 10 to 15 ms of a 474 ms boot under a 4x CPU throttle: too little for a round. The apps' own chunks were the
gap: Vite warned of an ineffective dynamic import in Notepad.

- **Notepad's chunk was 366 KB (114 KB gzipped)**, three quarters of it the Markdown preview's: highlight.js
  (156 KiB), which the preview meant to import on demand but whose module it also imported a value from
  (`hasFencedCode`), and react-markdown with remark-gfm (about 100 KiB), for a preview a text file never shows.
  `hasFencedCode` moved to `lib/fences.ts` and the preview is `React.lazy`: Notepad's chunk is 42 KB (14.5 KB
  gzipped), the preview 158 KB and the highlighter 167 KB, each fetched when first needed. Walked from Files: a
  `.txt` note fetches Notepad alone, a `.md` one the preview and the highlighter, and draws highlighted code.

**Looked at and left in round 9:** the Terminal's search add-on (31 KiB of a 414 KB chunk that is cached after the
first Terminal); File Manager's chunk, which is its own code; the 5,000-line scrollback, a feature.

## Round 10 (2026-11-23): the image's node_modules

**Method.** The `proddeps` stage built in Docker here, measured by its files' bytes and a tar of the tree (what a
layer weighs), not `du`, whose 4 KiB blocks make thousands of small files look larger. Then a test stage on top of
it with the backend from the `builder` stage: started in a container and asked `/health`, the first-run setup,
sign-in, `/api/system/stats` and `/api/prefs`.

| The production node_modules | Before | After |
|---|---:|---:|
| Files | 10,045 | 5,237 |
| Bytes | 49.1 MB | 25.6 MB |
| As a layer (tar) | 57.5 MB | 30.2 MB |

- **`proddeps` deletes what no runtime reads:** type declarations, the TypeScript sources packages ship beside
  their JavaScript (no `main` or `exports` names one to run), source maps (the backend runs without
  `--enable-source-maps`), Markdown and `.github`. Licences stay; directories named `test` stay, since a package
  could keep runtime code in one. The backend on the pruned tree answered every route asked, with no error logged.
- **The WebSockets don't compress**: `ws` servers default to no per-message deflate, so frames already compressed
  (WebP, VP8) aren't deflated again.

**Looked at and left in round 10:** the backend loads 1,487 modules, 5.3 MiB of source, at start. 534 KiB of it is
libphonenumber-js, which class-validator's index loads for a phone-number decorator no DTO uses, and 987 KiB is zod;
leaving either means deep imports into class-validator or moving every DTO to one validator, a refactor of its own.
