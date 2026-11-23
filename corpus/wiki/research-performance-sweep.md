---
summary: The 2026-11-23 performance sweep, five rounds on one branch and one PR, each measured before and after. Round 1 cut the first page load from 1,077 to 913 KiB of scripts and stylesheet (the kit's sideEffects, framer-motion's features loaded lazily) and the wire from 1,184 to 372 KiB cold and 34 revalidations to none warm (precompressed brotli and gzip, a year's cache for hashed assets). How each number is taken, and what was looked at and left.
updated: 2026-11-23
---

# The performance sweep (2026-11-23)

The owner asked for five rounds of performance work: the same features on fewer resources. Each round lands
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
