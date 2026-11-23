---
summary: The 2026-11-23 performance sweep, fifteen rounds on one branch and one PR, each researched and measured before and after. Round 1 cut the first page load from 1,077 to 913 KiB of scripts and stylesheet (the kit's sideEffects, framer-motion's features loaded lazily) and the wire from 1,184 to 372 KiB cold and 34 revalidations to none warm (precompressed brotli and gzip, a year's cache for hashed assets). Round 2 cut what the tab does at rest: bars scale instead of resizing (System Monitor 1.94% to 0.89% of a core) and the Terminal's cursor stops blinking 10 s after the last keystroke (2.29% to 0.24%). Round 3 measured the Wayland host with real foot and weston-terminal windows: the encoder stays, and the host now sends only damaged pixels that changed (slow terminal output 640 to 330 ms of host CPU). How each number is taken, and what was looked at and left.
updated: 2026-11-23
---

# The performance sweep (2026-11-23)

The owner asked for rounds of performance work (five, then fifteen, each with research): the same features on fewer resources, including the Wayland host, the builds and the OS's own flows. Each round lands
on the branch `claude/busy-hopper-78yv97` and its one PR, measures before and after the same way, and records
here what it changed and what it looked at and left, so the next round starts where this one stopped.

## How the numbers are taken

- **The first page load** is what the built `index.html` names and everything those modules import
  statically: the entry, its static imports and the stylesheet. Summed raw and gzipped (level 9) by a script
  over `apps/core/dist`; bytes are attributed to packages and files from a `vite build --sourcemap`.
- **The wire** is the production backend (`node apps/backend/dist/main` with `STATIC_ROOT` at the build, as
  the image runs it) driven by headless Chromium at 1280 by 800: sign in, wait for the taskbar and the
  network to settle, then sum `transferSize` over `/assets/` in the resource timings. A warm reload repeats
  it in the same context and counts the entries that went to the network.
- **The walk** in the same run: Start reaches full opacity, Calculator opens to full opacity and scale and
  unmounts on close, a desktop icon drags 120 by 80 px, and the page logs no error.
- The build for the wire must be made with `VITE_API_URL=/api`, as the image's is; without it the desktop
  calls `/prefs` instead of `/api/prefs` and never gets past start-up.
- The machine: the cloud container of 2026-11-23, 4 vCPU, 16 GiB, Node 24.22.3. No Docker daemon, so no
  container cap; the numbers here are bytes and requests, which a cap does not change.

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
