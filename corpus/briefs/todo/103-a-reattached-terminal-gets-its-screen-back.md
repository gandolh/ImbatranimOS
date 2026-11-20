# Brief 103: A reattached Terminal gets its screen back exactly (measure first)

**Depends on:** 101 (workloads), 102 (reattach). **Runs after:** 102.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 2.

## Context

- Brief 102 replays a detached pty's last 256 KiB of raw output into a reset
  xterm and sends a SIGWINCH. A shell prompt and most full-screen programs
  look right after that. What can go wrong: a program that set modes long ago
  (the alternate screen, mouse tracking, application cursor keys) whose
  setting fell out of the ring, and scrollback older than the ring.
- VS Code's persistent terminals keep a headless xterm beside each pty and
  send its serialized state on reconnect. Here that is `@xterm/headless` 6.0.0
  and `@xterm/addon-serialize` 0.14.0, the same project as the tab's xterm.
  libghostty-vt has snapshots too, but no 1.0 yet.
- The cost is on the hot path: the backend would parse every byte of every
  Terminal a second time, on one CPU.

## Decisions (the bar, written before measuring)

1. **Measure with brief 101's runner**, under the production cap: the 50 MB
   ASCII `cat` and the SGR file through the PTY with and without a headless
   xterm fed in the session; backend CPU time and wall time to drain; backend
   RSS per Terminal at 5000 lines of scrollback.
2. **Quality**: reattach after each of the five recorded sessions mid-way,
   plus `vim` with a split, `less` on a long file, and `htop`; compare the
   tab's screen with what it showed before the reload (Playwright shots, a
   pixel diff on the terminal element).
3. **Ship the headless restore only if** the ring restore gets at least one of
   those screens wrong **and** the headless one costs at most 10% more drain
   time, 10% more backend CPU, and 8 MB more RSS per Terminal. Otherwise stop:
   the numbers go on `wiki/how-we-measure.md` (brief 101 writes it) or a new
   research page, and the brief closes as measured, not built.
4. If shipped, the headless terminal's scrollback matches the tab's (5000
   lines), and the ring goes.

## Files you OWN

- `apps/backend/src/modules/pty/` (the session and registry), `apps/backend/package.json`
  if shipped, and their specs.
- Corpus: a research page or `wiki/how-we-measure.md` for the numbers,
  `wiki/status.md` (append to a line), `log.md`.

## What to do

1. The measurements in decisions 1 and 2, written up with the method.
2. Build only if decision 3 passes; then the specs (a serialized state
   restores the alternate screen and the cursor mode) and a walk with
   `vim` across a reload.

## Acceptance

- [ ] The numbers for both restores are written down with the cap they ran
  under.
- [ ] If built: every listed screen restores exactly and the costs are inside
  the bar. If not: the outcome note says why, with the numbers.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy` if built (owner step
  `node cli.ts imbatranim-os server`), else `done`.
