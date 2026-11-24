---
summary: The 2026-11-23 performance sweep, fifteen rounds and fifteen more from 2026-11-24 (with a ranked deploy and infrastructure research), on one branch and one PR, each researched and measured before and after; how its numbers are taken, one line per round with the page that holds it, and what it leaves for later. Rounds 1-5 are in research-performance-sweep-1.md, 6-10 in -2, 11-15 in -3, 16-20 in -4, 21-25 in -5, 26-30 in -6.
updated: 2026-11-24
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

## The rounds

| Round | What changed | Page |
|---|---|---|
| 1 | The first page load 1,077 to 913 KiB; precompressed, year-cached assets (a cold load's wire 1,184 to 372 KiB) | [1](research-performance-sweep-1.md) |
| 2 | At rest: bars scale (System Monitor 1.94% to 0.89% of a core), the Terminal's cursor stops blinking after 10 s (2.29% to 0.24%) | [1](research-performance-sweep-1.md) |
| 3 | The Wayland host sends only damaged pixels that changed (slow terminal output 640 to 330 ms of host CPU) | [1](research-performance-sweep-1.md) |
| 4 | A scroll in a Linux window moves the tab's own pixels (encoding 5): 1,166 KiB of VP8 to 131 KiB lossless | [1](research-performance-sweep-1.md) |
| 5 | The image rebuilds only what a commit changed (a version bump 24 to 2 s, a host change 147 to 67 s); brotli 11 for the first load only | [1](research-performance-sweep-1.md) |
| 6 | The backend's young generation capped at 2 MiB semi-spaces: 159 to 118 MiB after load, same CPU | [2](research-performance-sweep-2.md) |
| 7 | A dragged window moves with CSS translate: 60 moves of a File Manager window 351 to 114 ms of main thread; @use-gesture gone | [2](research-performance-sweep-2.md) |
| 8 | The Wayland host's frame clock runs only while there is work: idle host CPU to zero, foot's keystroke to frame 20 to 5 ms | [2](research-performance-sweep-2.md) |
| 9 | Notepad loads its Markdown preview and highlighter only for Markdown: its chunk 366 to 42 KB | [2](research-performance-sweep-2.md) |
| 10 | The image's node_modules without declarations, sources, maps and docs: 49 to 26 MB, its layer 57 to 30 MB | [2](research-performance-sweep-2.md) |
| 11 | Files on a large folder: synchronous stats in batches, a 20,000-entry listing 630 to 165 ms and its size 820 to 70 ms; the Linux frame path measured lean | [3](research-performance-sweep-3.md) |
| 12 | A Terminal's flowing output in one frame per 5 ms; **reverted in round 16**: pinned to one CPU it cost the backend 31% more on a flood, as brief 114 had found | [3](research-performance-sweep-3.md) |
| 13 | A focus change no longer re-renders the desktop: 194 to 88 components a click, script 10.0 to 5.6 ms; no leaks found, the host 6-10 MiB, SQLite already at NORMAL | [3](research-performance-sweep-3.md) |
| 14 | Scrolling a 20,000-file folder: the sort and the rows memoised, 108 to 51 ms a wheel step | [3](research-performance-sweep-3.md) |
| 15 | A static Marketplace app keeps what it serves: Accessories' build directory 140 to 8 MB | [3](research-performance-sweep-3.md) |
| 16 | Deploys and infrastructure researched and ranked ([research-deploy-infrastructure.md](research-deploy-infrastructure.md)), brief 118 written, round 12 reverted after a pinned re-measure | [4](research-performance-sweep-4.md) |
| 17 | A deploy builds the image's slow parts once, as local tagged bases (`infrastructure/image.sh`): a code-only deploy after a pruned cache 181 to 28 s | [4](research-performance-sweep-4.md) |
| 18 | Marketplace builds at a lower CPU priority: measured, not built (the desktop already stays responsive) | [4](research-performance-sweep-4.md) |
| 19 | A service app keeps only what its server runs on (`server.install`): imbatranim-office 964 to 86 MB; its build found not to fit the 1 GiB cap | [4](research-performance-sweep-4.md) |
| 20 | The dev image builds on the runtime base: a rebuild after a dependency change 85 to 48 s | [4](research-performance-sweep-4.md) |
| 21 | A lazy kit `Tooltip`: a wheel step in a 20,000-file folder 45.6 to 32.6 ms, opening it only −7%; measured, filed as brief 119 | [5](research-performance-sweep-5.md) |
| 22 | Settings mounts a section's content when it scrolls near: opening it 288 to 61 ms of main thread, the backend's CPU about 560 to under 10 ms | [5](research-performance-sweep-5.md) |
| 23 | The boot's icon drag and a worker for the Nix package index: measured, not built (no gain; no stall to remove) | [5](research-performance-sweep-5.md) |
| 24 | Firefox's spare processes off: PSS 519 to 439 MiB; measured, filed as brief 120 (a policy file shows a "managed" notice) | [5](research-performance-sweep-5.md) |
| 25 | npm's cache for Marketplace builds emptied past 256 MB: each update with new dependencies had added up to 16 MB for good | [5](research-performance-sweep-5.md) |
| 26 | The gate runs its static steps side by side, ESLint on threads: 176 to 125 s; the e2e test that hung in half the gates was a WebSocket proxy dropping a server's first frame, fixed | [6](research-performance-sweep-6.md) |
| 27 | The Image Viewer's date grid shows each photo's Exif preview: 93.6 to 4.1 MiB, tiles 703 to 281 ms, the renderer about 830 to 380 MiB | [6](research-performance-sweep-6.md) |
| 28 | Validators on file downloads: measured, not built (the tab already reuses a photo it holds) | [6](research-performance-sweep-6.md) |
| 29 | Vitest's vmThreads pool for the desktop's tests: 25 to 12 s, measured, not built (realm differences, 1.8 GB) | [6](research-performance-sweep-6.md) |
| 30 | The closing check: the first load 913 to 895 KiB since round 1, the wire 372 to 370 KiB, the desktop at rest 0.11% of a core; no regression | [6](research-performance-sweep-6.md) |

## What the sweep leaves for later

The questions the owner put, answered by what was measured:

- **A lighter Wayland compositor.** The host already is a small library core (smithay) with our compositor over it and
  the browser drawing: a 3.9 MB binary, 6 MiB of memory for a session and 10 MiB with a terminal open, no CPU at rest
  (round 8), and it sends only changed pixels (round 3) or a move of pixels the tab holds (round 4). A Wayland client
  draws its own pixels, so the browser cannot draw its text or widgets for it; what stays open is where the tab draws.
  Decoding and drawing a Linux window could move to a worker with an `OffscreenCanvas`, which would take the draw off
  the desktop's main thread (about 0.3 ms a frame in software, round 11). Not built: measure it with a GPU browser
  first.
- **Building imbatranim-apps.** On the box a suite installs in about 5 s with a warm npm cache, and now keeps 8 MB
  rather than 140 (round 15); a service app keeps only its server's install (round 19) and npm's cache is capped
  (round 25). imbatranim-office's build does not fit the 1 GiB cap (round 19): brief 118 or a leaner build there.
- **Building the OS.** The image's slow parts are local tagged bases (round 17) and the prod stage, Nix included, was
  built and booted here; the ISO (`iso/`) was not.
- **The owner's steps:** vps-deploy runs `infrastructure/image.sh` instead of `docker compose build` (never with
  `--pull`), and any prune there takes `--filter label!=imbatranim.base`
  ([research-deploy-infrastructure.md](research-deploy-infrastructure.md)); the calls in briefs 118 (prebuilt app
  output), 119 (a lazy kit tooltip) and 120 (Firefox's spare processes), all built on 2026-11-24.
- **Left, with numbers, for whoever comes next:** Monaco's inline completions (240 KiB a Code Editor open, round 13),
  moving the File Manager's virtualizer into its list (round 14), a lazy kit `Tooltip` (brief 119, round 21),
  Firefox's spare processes (brief 120, round 24), and Vitest's `vmThreads` pool for the desktop's tests (round 29). The
  gate itself runs its static steps side by side since round 26.
