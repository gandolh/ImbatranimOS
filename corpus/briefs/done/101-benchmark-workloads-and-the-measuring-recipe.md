# Brief 101: Benchmark workloads and the measuring recipe

**Depends on:** nothing. **Runs after:** 100.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md)
("Habits for every repo").

## Context

- Briefs 103, 113, 114 and 115 ship only if a measurement passes a bar
  written before measuring. They need the same inputs and the same method,
  or their numbers can't be compared.
- Ghostty's benchmark rules (`ghostty@d69f9ed:src/benchmark/AGENTS.md`):
  generate inputs once and benchmark them later; keep large inputs out of the
  repo; reuse identical files across revisions; fixed seeds; compare medians
  of repeated runs after warmups; never run two benchmarks at once on the same
  machine. Its biggest I/O gains in 1.3 came from about 4 GB of real terminal
  recordings, not synthetic input.
- Brief 89 measured video with one fixed clip under the production cap (1 GiB,
  one CPU), set with `cpu.max` in the dev container
  ([research-video-in-linux-windows.md](../../wiki/research-video-in-linux-windows.md)).
  Brief 88 runs Playwright against the dev container.

## Decisions

1. **Inputs live in `$XDG_CACHE_HOME/imbatranim-bench/`** (default
   `~/.cache/imbatranim-bench/`), never in the repo. A generator script makes
   them from fixed seeds and prints each file's sha256; the recipe page lists
   the expected sums.
2. **Synthetic text** (for the Terminal path): 50 MB plain ASCII lines; 20 MB
   of SGR-heavy lines (256-colour and truecolour, bold, underline); 20 MB of
   CJK and emoji mixed with ASCII.
3. **Recorded sessions**, in asciicast v2 (the asciinema format, a known one):
   a recorder spawns a command under node-pty and saves its output with
   timing. Five: `ls -lR /usr`, `git log -p` on this repo piped through
   `cat`, a TUI redrawing for 10 s (`top`), an editor scrolling a long file,
   and a build log (`npm ci` in a scratch copy of a small package). A
   replayer plays a recording without its pauses.
4. **One runner** for every brief: two warmups, ten runs, median and 95th
   percentile, the machine and cap recorded beside the numbers. A lock file
   refuses a second run while one is going.
5. **The cap is production's**: one CPU and 1 GiB on the dev container, as
   brief 89 set it.

## Files you OWN

- `scripts/bench/` (new): the generator, the recorder, the replayer, the
  runner, a README, tests for the generator's determinism.
- Corpus: a new `wiki/how-we-measure.md` (the rules above, the sums, how to
  set the cap, "write the bar before measuring", and "measured, not built" as
  a valid end), `wiki/status.md` (append to a line), `log.md`.

## What to do

1. The generator, with a test that two runs give the same sha256.
2. The recorder and replayer; record the five sessions in the dev container
   and list their sums.
3. The runner, used once end to end: `cat` of the 50 MB file through today's
   Terminal (PTY, socket, xterm in headless Chromium via Playwright), wall time
   from first byte to last frame, so 113 and 114 start from a baseline.
4. The recipe page.

## Acceptance

- [ ] The inputs regenerate byte for byte; the recordings replay.
- [ ] One baseline number for the 50 MB `cat` is on the recipe page, with the
  cap it ran under.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `done` (nothing to deploy).

## Outcome (2026-11-22)

Built in `0ec623e` (1.391.0); the recipe is [how-we-measure.md](../../wiki/how-we-measure.md).
`scripts/bench/`: `generate.mjs` (mulberry32 from fixed seeds; whole lines up to each size), `record.mjs`
(node-pty, taken from the backend workspace that owns it, so the root gains no dependency; `--keys` types
into a program such as an editor), `replay.mjs`, `run.mjs` (two warmups, ten runs, nearest-rank median and
p95, the machine with cgroup v2's `cpu.max` and `memory.max`, a lock file that refuses a second run while the
first lives), `workloads/terminal-cat.mjs` (Playwright from the desktop workspace), a README, and
`generate.test.mjs` (`node --test`, as the scripts' other test runs). knip's root entry gains the two
folders.

**Acceptance.** The inputs regenerate byte for byte: two full runs printed the same three sums (on the
recipe page); the test checks it on every input at 256 KiB. The five recordings replay (6.8 MB, 14.7 MB,
15 KB, 249 KB and 1.7 KB of output). The lock refused a second run. **The baseline**, 50 MB `cat` through
the Terminal, ten runs: median 2,733 ms (p95 3,100 ms) uncapped, and 2,434 ms (p95 2,734 ms) with the
backend pinned to one CPU.

**Not as the brief asked:** Docker's daemon is down in this session, so the five sessions were recorded,
and the baseline taken, on the host (4 vCPU Xeon at 2.1 GHz, 15.7 GiB), with the backend and the desktop
running directly and Alpine's BusyBox ash as the shell. Production's full cap (one CPU and 1 GiB on the
container) couldn't be set; `taskset` stood in for the CPU half. The recipe page says how to set the cap in
the dev container and leaves that row and the container's recording sums to fill.

`npm run check` exit 0; `bash corpus/lint.sh` OK. Nothing to deploy.

