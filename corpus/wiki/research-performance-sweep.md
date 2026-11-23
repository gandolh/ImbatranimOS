---
summary: The 2026-11-23 performance sweep, fifteen rounds on one branch and one PR, each researched and measured before and after; how its numbers are taken, and one line per round with the page that holds it. Rounds 1-5 are in research-performance-sweep-1.md, 6-10 in research-performance-sweep-2.md.
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
