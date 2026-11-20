# Brief 114: PTY output batched only when it floods, measured

**Depends on:** 101 (workloads and runner). **Runs after:** 113.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 7.

## Context

- `apps/backend/src/modules/pty/pty-session.ts` sends one WebSocket frame per
  node-pty data event, with backpressure at 1 MiB buffered (pause) and
  256 KiB (resume). In the tab every frame is a `message` event and an
  `xterm.write` call.
- Ghostty 1.4 found that macOS hands a pty reader at most about 1 KiB per
  read, and gained 25% to 55% throughput by gathering reads on one thread
  while parsing on another (`ghostty@d69f9ed:src/termio/Exec.zig`, the
  `ReadThread` comment). Its batching rule keeps typing instant: a batch goes
  out at the first empty read unless at least 1 KiB has gathered; only a
  saturated stream waits, for a budget well under a frame.
- Linux reads are larger than macOS's, so the gain here may be small. That is
  what this brief measures.

## Decisions (the bar, written before measuring)

1. **Measure first** with brief 101's runner under the production cap:
   WebSocket frames per second and bytes per frame during the 50 MB ASCII
   `cat` and `yes | head -c 50M`; wall time to drain; backend CPU time; and
   keystroke-to-echo latency (median, 95th percentile, 50 keys) at an idle
   prompt.
2. **The rule to try**: a chunk under 1 KiB with nothing pending goes out at
   once; otherwise chunks gather until 64 KiB or 4 ms, whichever comes first.
   Backpressure stays as it is.
3. **Ship only if** drain time or backend CPU drops at least 15%, and
   keystroke p95 moves by under 1 ms. Otherwise stop: numbers written up,
   closed as measured, not built.

## Files you OWN

- `apps/backend/src/modules/pty/` (`pty-session.ts`, constants, specs).
- Corpus: the numbers' page, `wiki/status.md` (append to a line), `log.md`.

## What to do

1. The baseline measurements.
2. The rule behind a constant, specs with fake timers (a single keystroke's
   echo is sent at once; a flood is sent in at most 64 KiB frames no later
   than 4 ms), then the same measurements.
3. Keep or revert by the bar; write both sets of numbers.

## Acceptance

- [ ] Both sets of numbers are written down with the cap.
- [ ] If built: the bar holds and the specs pass. If not: reverted, and the
  outcome note says why.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy` if built (owner step
  `node cli.ts imbatranim-os server`), else `done`.
