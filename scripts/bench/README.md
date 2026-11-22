# scripts/bench: measuring, the same way every time

The inputs, recorder, replayer and runner behind every brief that ships only if a number passes a bar. The
rules (generate once, keep inputs out of the repo, write the bar before measuring, two warmups and ten runs,
never two benchmarks at once, production's cap) and the expected sums are on
[corpus/wiki/how-we-measure.md](../../corpus/wiki/how-we-measure.md).

Everything lands in `$XDG_CACHE_HOME/imbatranim-bench/` (default `~/.cache/imbatranim-bench/`), never here.

| Script | What it does |
|---|---|
| `generate.mjs [plain\|sgr\|cjk]` | Writes the synthetic Terminal inputs from fixed seeds and prints their sha256 |
| `record.mjs <name> [--keys TEXT] -- <command…>` | Runs a command under a PTY and saves its output with timing as `recordings/<name>.cast` (asciicast v2) |
| `replay.mjs <file.cast>` | Writes a recording's output without its pauses |
| `run.mjs <workload.mjs> [--warmups 2] [--runs 10]` | Runs a workload: warmups, runs, median and p95, the machine and cap; saves `results/<name>-<time>.json` |
| `workloads/terminal-cat.mjs` | `cat` of the 50 MB input through a desktop Terminal window (needs `BENCH_STATE`, a signed-in Playwright storage state) |

The generator's determinism test: `node --test scripts/bench/generate.test.mjs`.

A workload module exports `name` and `run()` (resolving with the milliseconds one run took, measured by the
workload itself), and optionally `setup()` and `teardown()`.
