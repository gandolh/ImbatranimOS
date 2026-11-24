---
summary: Rounds 1-5 of the 2026-11-23 performance sweep in full - the first page load (the kit's sideEffects, lazy framer-motion, precompressed year-cached assets), the tab at rest (scaled bars, the cursor's 10 s blink), the Wayland host's changed-pixel bands and scroll moves (encoding 5), and the image's build caching - each with its method, numbers and what was looked at and left.
updated: 2026-11-23
---

# The performance sweep, rounds 1-5

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).

## Round 1 (2026-11-23): the first page load and how it is sent

| | Before | After |
|---|---:|---:|
| First page load, scripts and stylesheet | 1,077 KiB (336 KiB gzip) | 913 KiB (288 KiB gzip) |
| Cold load, assets on the wire (direct to the backend) | 1,184 KiB, 34 requests | 372 KiB, 28 requests |
| Warm reload, asset requests | 34 (all revalidated) | 0 |

- **The kit declares `sideEffects`** (`packages/ui/package.json`, `["*.css"]`). Without it every module the
  barrel re-exports ran with any one import, so Slider, Tabs, Select, BottomSheet and RadioGroup with their
  Base UI parts were in the first page load. 1,077 to 992 KiB.
- **framer-motion's features load lazily.** `m.div` under one `LazyMotion` in `main.tsx`, `domMax` from
  `lib/motionFeatures.ts` by dynamic import (an icon drags, so not `domAnimation`); `strict` and a lint rule
  keep `motion.*` out. 992 to 913 KiB; the features are an 84 KiB chunk.
- **Precompressed, cached assets.** The build writes `.br` (quality 11) and `.gz` beside each compressible
  file of 1 KiB or more under `assets/` (15.9 MiB become 3.1 and 4.0 MiB); `apps/backend/src/static-assets.ts`
  sends the best one the request accepts, and hashed assets are `immutable` for a year while `index.html` is
  `no-cache`. Behind Caddy this also ends `encode gzip`'s work per response, since a response that already
  carries `Content-Encoding` passes through. The image grows by the 7 MiB of copies; the build by about 12 s.

**Looked at and left in round 1:**

- **axios** (49 KiB raw in the first page load). It is the `system.http` contract every add-on reads
  (`AxiosError`, `isAxiosError` in `system/appInstance.ts`), so swapping it is a contract change, not a
  bundle tweak.
- **@use-gesture** (20 KiB), used only for dragging a window by its title bar. A pointer-events drag
  would remove it; worth a later round.
- **The core's own boot code** (about 188 KiB) is spread over some 200 files with nothing large; the Linux
  windows module is the biggest group (about 35 KiB).
- **Base UI** is still about 149 KiB of the first page load: the shell's dialogs, menus, popovers, tooltips
  and scroll areas use it at sign-in.
- **The backend at rest**: its timers are 15 s and 30 s sweeps, and the System Monitor's `/proc` reads run only
  while a window or the widget polls. Nothing to cut there.
- **A marketplace e2e test** ("runs a service app's server behind the session") times out at 60 s in this
  container on `main` too; it is the environment, not the sweep.

## Round 2 (2026-11-23): what the tab does at rest

**Method.** `idle.mjs`: sign in, open the apps named, wait 10 s, then read Chromium's `Performance.getMetrics`
across 30 or 60 s with nothing touched: main-thread task time, layouts, style recalculations. React commits come
from a stand-in `__REACT_DEVTOOLS_GLOBAL_HOOK__` that counts `onCommitFiberRoot`, and `document.getAnimations()`
lists what is still running. The backend's CPU is from `/proc/<pid>/stat` over the same window.

| At rest | Before | After |
|---|---:|---:|
| Empty desktop, 60 s | 0.12% of a core, 11 commits, 3 requests | (unchanged) |
| System Monitor, 30 s | 1.94%, 345 layouts, 362 style recalcs | 0.89%, about 22 and 118 |
| Terminal, focused, 30 s | 2.29%, 1,801 style recalcs | 0.24%, none |

- **Bars scale instead of resizing.** The System Monitor's gauges, the stats widget and Files' job bar
  transitioned `width` for 300 ms after each poll, a layout every frame. `scaleX` from the left edge runs on
  the compositor (web.dev's "stick to compositor-only properties").
- **The cursor stops blinking 10 s after the last keystroke.** xterm's DOM renderer blinks with an endless
  CSS animation of `background-color`, which can't be composited, so a focused Terminal restyled every frame.
  GTK's `gtk-cursor-blink-timeout` (GNOME's default 10 s, reset by each interaction, for CPU power management)
  is the rule; VS Code hit the same cost (about 13% CPU, microsoft/vscode#22900). `lib/cursorBlink.ts`.

**Looked at and left in round 2:**

- **Caching prepared SQLite statements.** Every authenticated request prepares two (the session and the
  owner); cached they cost 3.5 µs instead of 13.5 µs, under 2% of a request's 0.6 ms. Not worth 84 call sites.
- **`os.cpus()` in `/system/stats`**: 0.06 ms; the whole collection is about 0.13 ms. The endpoint's 2 ms of CPU
  is the request path and the thread pool's file reads, not the collection.
- **The request path itself**: `/health` costs 0.28 ms of CPU and an authenticated `GET /api/prefs` 0.60 ms
  (Express and Nest). A Fastify adapter would cut it but touches every middleware, upload and upgrade.
- **The Clock's one-second tick** (34 commits in 30 s) is the seconds it shows; Files, Notepad, Calendar,
  Media Player and Code Editor sit at 0.12% to 0.22% at rest.

## Round 3 (2026-11-23): the Wayland host's frames

**Method.** The host built on this machine (glibc, Ubuntu 24.04's libxkbcommon and libvpx; no Docker daemon, so
not the Alpine builder image), started by the backend from `WAYLAND_HOST_BIN`, with foot, weston-terminal and
Xwayland from Ubuntu. `linuxapp.mjs` opens the OS Terminal in headless Chromium, starts the app with `&` so it
opens as a Linux window, maximises it, runs the workload, and reads the host's CPU from `/proc`, and the frames
and bytes the tab received from CDP's `Network.webSocketFrameReceived`. A throwaway build logged, per commit,
the damaged pixels, the per-row span of pixels that changed, and the changed full-width rows that already
existed in the previous frame (what scroll detection could move instead of encoding).

**The encoder stays.** On real 1280 by 800 frames (a Terminal of `ls -l`, File Manager, the desktop with Start
open), the host's pure-Rust lossless WebP (`image-webp` 0.2.4) took about 5 ms and 250 KiB for a full
terminal frame. PNG at its fastest (`png` 0.18, fdeflate) was twice as fast at twice the bytes; libwebp's
lossless at method 0 was 3 to 7 times slower for 35 to 60% fewer bytes. On one CPU neither beats it.

**What apps damage.** foot and weston-terminal damage the whole window on every scroll. Wheeling 30 notches
through foot's scrollback damaged 26.9 Mpx, whose changed rows spanned 2.28 Mpx (8%), and only 0.12 Mpx
(0.4%) of those rows were not already somewhere in the previous frame. Typing damages only the cell.

| Host CPU / bytes to the tab, median of 3 | Before | After |
|---|---:|---:|
| foot, a short line every 50 ms for 6 s | 640 ms / 1,439 KiB | 330 ms / 876 KiB |
| weston-terminal, the same | 80 ms / 37 KiB | 40 ms / 7 KiB |
| foot, typing a line | 40 ms / 9 KiB | (unchanged) |
| foot, wheel through the scrollback | 350 ms / 1,161 KiB | (unchanged) |

- **Only changed pixels go.** Each damaged row is converted into a scratch row and compared with the host's
  copy; the frame carries bands of changed rows (rows up to 8 apart join), each as wide as its changes. TigerVNC's
  ComparingUpdateTracker, done where the row is read anyway. A commit that changed nothing sends no frame.

**Looked at and left in round 3:** the encoder (above). An X11 app (`xterm` through Xwayland) didn't open a
window here, so X11 went unmeasured.

## Round 4 (2026-11-23): a scroll moves the tab's pixels

The owner's idea of a thin host with the browser drawing, in the form the earlier research left open
([research-remote-ui-rendering.md](research-remote-ui-rendering.md) ruled out describing the UI): the tab already
holds a window's pixels, so a scroll can be an instruction to move them. xpra's scroll encoding and VNC's CopyRect
do the same.

- **Protocol.** Encoding 5, a copy: the rectangle is the destination, 8 bytes of data the source. The tab draws
  its own canvas onto itself (the HTML standard reads the source first, so they may overlap), clipped, with
  `copy` compositing so nothing blends. A tab asks for it with `copy` in `codecs`, now the optional encodings it
  draws (the backend's `TAB_CODECS`); an older tab never gets one, so `hello` stays at 10.
- **The host.** In the largest damaged rectangle at least 48 rows tall, hashes of the old and new rows vote for a
  distance; every row of a run is compared byte for byte, and each run of 16 rows or more goes as a copy, in an
  order where none reads what an earlier one wrote. Only the rows outside the runs that changed go as pixels,
  and only they feed the lossy tracker. No copy after a new size, a resync, a wake or a window shown again.
- **A trap found on the way.** foot draws its scrollback marker as a subsurface, so each wheel step changes the
  window's layout, and the layout path redrew everything and (in the first cut) turned copies off: the scroll then
  went as VP8. `send_whole` is now separate from `damage_all`, and a marker splitting a page gives two copies.

| Median of 3 | Round 3 | Round 4 |
|---|---:|---:|
| foot, 30 wheel notches: host CPU / bytes / tab main thread | 380 ms / 1,166 KiB (all VP8) / 328 ms | 230 ms / 131 KiB (lossless) / 305 ms |
| foot, a line every 50 ms for 6 s | 350 ms / 863 KiB (part VP8) / 433 ms | 240 ms / 139 KiB / 368 ms |
| typing, weston-terminal | (unchanged) | |

The picture after the wheel workload is pixel-identical between the two builds; the host's tests simulate the tab
applying each frame and compare its picture with the host's.

## Round 5 (2026-11-23): building the OS

**Method.** The image's stages built for real in this container: a Docker daemon with the overlay2 driver
(vfs filled the disk at 57 GB), the base images from mirror.gcr.io (Docker Hub refused anonymous pulls), the
agent proxy and its CA added to each stage of a throwaway copy of the Dockerfile (never the committed one), and a
last stage that needs `builder`, `proddeps` and `wayland-host`. Each variant starts from a clean `git archive`,
builds cold, then rebuilds after three kinds of commit: the version bump alone (every commit has one), a change
to the host's source, and a change to an add-on. Four cores; a one-CPU build server takes longer, in proportion.

| Rebuild of the builder, proddeps and host stages after | Before | After |
|---|---:|---:|
| the version bump alone (every commit has one) | 24 s: the production `npm ci` (18.9 s) and the whole turbo build (23.2 s) | 2 s |
| a change to the host's source | 147 s: cargo from scratch (146 s), and the turbo build again (27.5 s) | 67 s: cargo's incremental build alone |
| a change to an add-on | 20 s | 19 s (the desktop must rebuild) |
| cold | 170 s | 157 s |

- **`proddeps` takes the normalised manifests.** It copied the real `package.json` and `package-lock.json`, whose
  version every commit bumps, so every build reran the production `npm ci` and node-pty's compile. `deps` already
  took the `manifests` stage's copies; now both do.
- **The builder leaves the host's sources out** (`COPY --exclude=wayland-host`, relative to the source: the
  pattern written from the context's root excluded nothing): a change to the host rebuilt the desktop and the
  backend too.
- **Cache mounts.** npm's download cache in `deps` and `proddeps`; turbo's cache in the builder (a workspace whose
  inputs didn't change is restored); cargo's registry and `target` in the host's stage (a change to the host's
  source recompiles the host, not its 300-odd dependencies; the binary is copied out to `/out`).
- **Brotli 11 only for the first page load,** 9 for the rest: the desktop's `vite build` from about 20 s to 10 s
  wall and 40 s to 13 s of CPU on four cores, the first page load's brotli byte for byte the same.

**Looked at and left in round 5:**

- **Marketplace installs** (imbatranim-apps' groups) already fetch the pinned commit alone (`--depth 1`), install
  one workspace, keep npm's cache between installs, and turn audit and fund off.
- **The type check in the image's build** (`tsc -b`, about 10 s of the desktop's 26 s): redundant with
  `npm run check` before a commit, but it is the image's last gate; the owner's call.
- **The host's release profile** (thin LTO, one codegen unit) costs compile time and pays it back at run time.
