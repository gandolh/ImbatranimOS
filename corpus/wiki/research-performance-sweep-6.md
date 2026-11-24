---
summary: Rounds 26-30 of the performance sweep in full. Round 26 ran the gate's static steps side by side with ESLint on threads (the whole gate 176 to 125 s) and found why the marketplace e2e test hung in half the gates, a real bug in the proxy to a service app's WebSocket (a server's first frame, arriving with its 101, was dropped). Round 27 had the Image Viewer's date grid show each photo's own Exif preview (93.6 to 4.1 MiB, tiles 703 to 281 ms). Rounds 28 and 29 measured validators on file downloads and Vitest's vmThreads pool and left both. Round 30 checked today's desktop against round 1's numbers and found no regression (the first load 913 to 895 KiB).
updated: 2026-11-24
---

# The performance sweep, rounds 26-30

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).
Rounds 21-25 are on [research-performance-sweep-5.md](research-performance-sweep-5.md).

## Round 26 (2026-11-24): the gate, side by side; a WebSocket proxy that dropped greetings

**The bar, written before measuring:** ship a change to `npm run check` only if its wall time on the four-core
container falls at least 25% (median of two each), a failing step still fails the gate with its tail printed, every
step keeps its own ok/FAIL line, and the tests are no flakier.

**What it was.** Five steps one after another. Alone, turbo forced: typecheck 32.6 s, lint 73.4 s (5.1 GB, typed
rules over the whole repository, no cache), format 2.6 s, conventions 7.1 s, tests 54.0 s. ESLint 10's
`--concurrency` lints the same 370 warnings in 38-41 s with two threads, at 4.7 GB. ESLint's own `--cache` was not
considered: with typed rules a change to one file's types can change another file's result, which the cache does not
see.

**What changed** (`140b560`). `scripts/check.mjs` takes steps joined by `+` as a group run side by side, and `check`
runs `typecheck+lint+format:check+check:conventions`, then `test` alone (it holds the timing-sensitive e2e suites). A
step alone still streams into the log; steps side by side each write one block when they finish. `lint` is
`eslint . --concurrency=auto`.

| The whole gate, turbo forced, four cores | Run 1 | Run 2 |
|---|---:|---:|
| One after another | 179.4 s | 173.6 s |
| Side by side, ESLint on threads | 134.3 s | 115.9 s |

Side by side, typecheck takes 53-54 s and lint 62-64 s, so the static group costs about 64 s instead of 120. A step
that fails inside a group still fails the gate with its tail.

**The flaky test was a bug** (`7c8479e`). Both modes failed one run of two on the same test, the marketplace e2e's
service-app server timing out at 60 s; alone, the file passed in 3 s and the whole e2e config in 8 s, and with the
backend's unit tests running beside it, it failed about half the time. The proxy to a service app's WebSocket
awaited the upstream's `open`, then upgraded the client and only then listened for the upstream's messages. When the
app's server sent a first frame in the same read as its 101, which a busy backend makes likely, the socket emitted
it on the next tick, before the await resumed, and it was lost. A standalone repro lost the frame every time. The
upstream is now paused on `open` and resumed once the pipe listens, and the `sim` fixture has a `/greet` route that
writes its 101 and a frame in one write; the test failed without the fix every time. With the unit tests beside the
e2e, three runs: 224 of 224 each.

## Round 27 (2026-11-24): the Image Viewer's date grid shows the photos' own previews

**The bar, written before measuring:** with 30 camera-style photos in the date view at 1280×800, ship only if the
bytes the grid transfers fall at least 90%, the time until every tile on screen shows falls at least 50%, the
renderer's and GPU process's memory is no higher, every tile still shows, and rotated photos stand upright.

**What it was.** Each 88 px tile's `<img>` was the whole file, loaded lazily: a full photo downloaded and decoded
per tile, and regrouping by capture date remounted tiles and fetched some again.

**What changed** (`b525680`). A camera stores a small JPEG preview in the photo's Exif block (IFD1), and the grid
already reads that block for the capture date, so the preview costs no request. `findExifThumbnail` takes it from the
same bytes with the photo's orientation; the tile shows it as an object URL with the CSS transform that stands it up.
A JPEG with no preview, one under 120 px, one of another shape than the photo (a camera that pads a 16:9 photo's
preview into 4:3) or with Exif of its own, and every other format, shows the file as before. The reads go in the
grid's order, and a JPEG not read yet waits for its preview rather than fetch the file.

| 32 photos (30 of 4000×3000 at 1.7 MB with a 320×240 preview, one without, one PNG), two interleaved sets of three | Before | After |
|---|---:|---:|
| Transferred | 93.6 MiB in 88 requests | 4.1 MiB in 33 |
| Every tile on screen drawn, final grouping (median) | 703 ms | 281 ms |
| Renderer process | 795-873 MiB | 355-409 MiB |
| GPU process | 82-86 MiB | 82-87 MiB |

Screenshots of the two grids match, portrait photos upright. Real phone photos are 3-5 MB, so the saving there is
larger.

## Round 28 (2026-11-24): validators on file downloads, measured and left

**The bar, written before measuring:** ship an ETag on `/api/files/download` only if opening a photo seen earlier in
the session (the viewer stepping back to it, or a second window) transfers at least 90% fewer bytes, a changed file is
never shown stale, and range requests still answer 206.

The route sends no ETag or Last-Modified. But in the tab, stepping three photos forward fetched three (4.9 MiB) and
stepping back fetched none, and a second viewer window on the same photo fetched none: Chromium reuses an image the
page already holds. Nothing to win in the bar's case, so it was not built. The Media Player's duration column already
reads only each track's header (`preload="metadata"`).

**Also looked at:** Docker's container log. The compose file sets no rotation, but the backend writes about 30 KB at
each start (its routes) and next to nothing per request, and Linux apps' output is ignored; left.

## Round 29 (2026-11-24): Vitest's pools for the desktop's tests, measured and left

`apps/core`'s tests are the gate's longest test task: 78 files, 56 of them in jsdom, 25 s alone (77 s of CPU). Same
850 tests:

| `vitest run` in apps/core | Wall | CPU | Peak memory |
|---|---:|---:|---:|
| `forks` (the default) | 25.8 s | 79 s | 0.3 GB |
| `threads` | 25.1 s | 77 s | 0.7 GB |
| `threads`, no isolation | 54 tests fail | | |
| `vmThreads` | 11.6 s, one test fails | 28 s | 1.8 GB |

`vmThreads` runs each file in a VM context of one process, so values cross realms: the failure is an
`instanceof ArrayBuffer` that is right in a browser's one realm. Vitest documents that pool's realm differences and
its memory growth; for a gate that must be trusted, 14 s is not worth them. Left.

## Round 30 (2026-11-24): the closing check against round 1

**The bar:** the sweep closes clean only if the first page load is within 2% of round 1's result (913 KiB raw), the
cold wire within 5% of 372 KiB, the walk (Start, Calculator, an icon drag) logs no error, and the empty desktop at
rest stays at round 2's 0.12% of a core. The bar file was written in the same step as the first size reading, not
before it.

| | After round 1 or 2 | Today (round 27's build, a fresh home) |
|---|---:|---:|
| First page load, raw / gzip | 912.9 / 288.3 KiB | 894.9 / 282.4 KiB |
| Cold wire, taskbar shown | 372 KiB | 369.6 KiB (twice), 44 requests |
| Warm reload | nothing fetched | nothing fetched |
| The walk | no error | no error |
| Empty desktop at rest, 60 s | 0.12% of a core, 11 commits, 3 requests | 0.11%, 11 commits, 3 requests |

A home used through the sweep loaded 418.9 KiB with three 404s: its restored windows, Bookmarks among them (a
Marketplace app installed in round 15) asking for data files it had not written, which it reads as "nothing saved".
The full gate passed in 101 s.
