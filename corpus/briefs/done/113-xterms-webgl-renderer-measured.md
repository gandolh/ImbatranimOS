# Brief 113: xterm's WebGL renderer, measured

**Depends on:** 101 (workloads and runner). **Runs after:** 112.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 6.

## Context

- The Terminal uses xterm.js's default DOM renderer (`Terminal.tsx` loads
  fit, search, Unicode 11 and web links, no renderer addon). xterm.js already
  pauses rendering while the terminal isn't visible.
- Ghostty's speed rests on a GPU renderer that redraws only dirty rows.
  xterm.js's version of that is `@xterm/addon-webgl` (0.19.0), which also
  draws box-drawing characters itself, so lines join without gaps.
- Costs to handle: Chromium keeps a small fixed number of live WebGL contexts
  per page and drops the oldest, so a lost context must fall back to the DOM
  renderer (`onContextLoss`). Ghostty 1.4 frees a hidden tab's GPU memory
  (385 MiB to 18 MiB with 20 hidden tabs, rebuilt in under a millisecond).
  Window zoom beside a Linux window crashed Chromium's renderer once and stays
  off ([decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md)).

## Decisions (the bar, written before measuring)

1. **Measure with brief 101's runner** in headless Chromium against the dev
   container under the production cap, DOM against WebGL: wall time to drain
   the 50 MB ASCII and the SGR file through `cat`; main-thread busy time (the
   sum of long tasks in a performance trace) over the same run; keystroke to
   painted echo, median and 95th percentile, 50 keys; tab memory with four
   Terminals open.
2. **Ship only if** main-thread busy time drops at least 30% on both files,
   drain time doesn't rise, keystroke p95 is no worse by more than 2 ms, and
   memory with four Terminals rises by at most 20 MB. Otherwise stop: numbers
   on `wiki/how-we-measure.md` (brief 101 writes it) or a research page,
   closed as measured, not built.
3. **If shipped**: WebGL loads when the browser gives a context; a lost
   context disposes the addon and the DOM renderer carries on; the addon is
   disposed while `useWindowVisible` is false and loaded again on show.
4. The owner checks it on Android Chrome; that is a question on the end move,
   not a gate.

## Files you OWN

- `apps/add-ons/repl-interpreter/` (`package.json`, `Terminal.tsx`, a new
  `lib/renderer.ts`, tests).
- Corpus: the numbers' page, `wiki/status.md` (append to a line), `log.md`.

## What to do

1. The measurements, written up with the method and the cap.
2. Only if the bar passes: the addon with its fallback and hide/show; a test
   that a lost context leaves a working terminal (`WEBGL_lose_context` in the
   walk); open 17 Terminals and check the first falls back cleanly; a Terminal
   beside a Linux window.

## Acceptance

- [ ] The numbers for both renderers are written down.
- [ ] If built: the bar holds, context loss and hiding are handled. If not:
  the outcome note says why.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy` if built (owner step
  `node cli.ts imbatranim-os server`, `--question` on Android Chrome), else
  `done`.

## Outcome (2026-11-23)

**Measured, not built**; the method and the table are on
[research-webgl-renderer.md](../../wiki/research-webgl-renderer.md). No code: the WebGL Terminal was a
throwaway patch (the addon's module copied from its npm tarball, behind a `localStorage` flag), reverted after
the runs; `package.json` is unchanged.

**Against the bar** (headless Chromium, so WebGL on SwiftShader, no GPU; backend pinned to one CPU): drain time
rose from 1,934 to 16,638 ms (50 MB plain) and from 1,823 to 10,135 ms (20 MB SGR), **fails**; main-thread long
tasks went from 0 ms on both to 832 and 7,668 ms a run, **fails**; keystroke-to-echo p95 fell from 34 ms to 5 to
13 ms, passes; four Terminals took about 215 MB of browser RSS against about 115 MB, **fails**.

**Not as the brief said:** the host machine, not the dev container (Docker's daemon was down), and the drain
workload is a scratch copy of `terminal-cat.mjs` that reads its end marker from xterm's buffer (the committed
one reads DOM rows, which a canvas renderer doesn't have). The page names what would reopen it: the same
method in a browser with a GPU, which is also the Android Chrome question.

`npm run check` exit 0 (no code changed); `bash corpus/lint.sh` OK. End move `done`.
