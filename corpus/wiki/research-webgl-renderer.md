---
summary: Brief 113's measurement (2026-11-23). xterm's WebGL renderer against its DOM renderer in the Terminal, in headless Chromium, where WebGL runs on SwiftShader (no GPU). WebGL echoes a key faster, but drains a cat 5 to 9 times slower, turns a run's main thread from no long tasks into 0.8 to 7.7 s of them, and four Terminals cost about 100 MB more. Measured, not built; a GPU-backed browser could change it.
updated: 2026-11-23
---

# xterm's WebGL renderer: measured

The Terminal draws with xterm.js's DOM renderer. `@xterm/addon-webgl` 0.19.0 draws with WebGL and redraws only
the rows that changed. Brief 113 wrote the bar first ([how-we-measure.md](how-we-measure.md), rule 1): ship
only if main-thread busy time drops at least 30% on both inputs, drain time doesn't rise, keystroke p95 is no
worse by more than 2 ms, and memory with four Terminals rises by at most 20 MB.

**Verdict: measured, not built.** Three of the four conditions fail.

## Method

- **Where.** A host machine, not the dev container (Docker's daemon was down): 4 vCPU Xeon at 2.3 GHz, Node
  24, the backend pinned to one CPU with `taskset -c 0` (how-we-measure.md's pinned row), Alpine's BusyBox ash as
  the shell, Vite serving the desktop, headless Chromium from Playwright at 1280 by 800. **Headless Chromium has
  no GPU: its WebGL runs on SwiftShader, on the CPU.** The brief named headless Chromium, so the numbers answer
  its question; they say nothing about a laptop's or a phone's GPU.
- **The WebGL Terminal** was a throwaway patch, never committed: the addon's built module copied from its npm
  tarball, loaded after `open()` when a `localStorage` flag asked for it, with `onContextLoss` disposing it.
- **Drain.** Brief 101's runner (two warmups, ten runs) with a scratch copy of `terminal-cat.mjs` that finds the
  end marker in xterm's buffer and stops at the render that shows it, so a canvas renderer is timed the same way.
- **Busy time.** The sum of long tasks (`PerformanceObserver`, type `longtask`, 50 ms and over) during each run.
- **Keystroke.** 50 keys at a prompt, 120 ms apart: from the page's keydown to xterm's first render after the
  echo was parsed.
- **Memory.** The RSS of all of Chromium's processes before and after opening four Terminals, each with
  `seq 1 3000` in it.

## The numbers

| | DOM | WebGL (SwiftShader) | Bar |
|---|---:|---:|---|
| 50 MB plain `cat`, drain median (p95) | 1,934 ms (3,618) | 16,638 ms (18,271) | no rise: **fails** |
| 20 MB SGR `cat`, drain median (p95) | 1,823 ms (2,710) | 10,135 ms (11,534) | no rise: **fails** |
| Main-thread long tasks per run, median, plain / SGR | 0 / 0 ms | 832 / 7,668 ms | 30% less: **fails** |
| Keystroke to echo, median (p95), two passes | 26.2 (34.2), 27.8 (34.6) ms | 3.5 (12.8), 3.0 (5.1) ms | p95 within 2 ms: passes |
| Four Terminals' RSS, two passes | +106, +123 MB | +214, +221 MB | at most +20 MB: **fails** |

The DOM renderer's work never made a long task: xterm's DOM renderer paints in frame-sized pieces. The WebGL
renderer's drawing ran on the CPU through SwiftShader, which is where both its drain time and its long tasks
went; the same drawing on a GPU would be most of the way to free.

## What would change the call

- **A browser with a GPU.** Re-run this page's method in a headed Chrome on the owner's laptop and on Android
  Chrome (the brief's end-move question). If WebGL then passes the bar, the brief's decision 3 still stands as
  the shape: load when a context is given, fall back on context loss, dispose while the window is hidden.
- **Keystroke echo.** The one win is real-looking but small next to the network's own round trip, and the DOM
  renderer's 26 to 28 ms is mostly waiting for the next frame.
