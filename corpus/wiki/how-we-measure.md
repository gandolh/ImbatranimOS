---
summary: How the OS measures before it builds (2026-11-22): the bar is written first, inputs are generated from fixed seeds into ~/.cache/imbatranim-bench (never the repo), five asciicast recordings, one runner (two warmups, ten runs, median and p95, a lock), production's one-CPU and 1 GiB cap, "measured, not built" as a valid end, and the first baseline: a 50 MB cat through the Terminal.
updated: 2026-11-22
---

# How we measure

Briefs 103, 113, 114 and 115 ship only if a number passes a bar. Numbers compare only when they come from
the same inputs, the same method and the same cap, so every such brief uses what is here and in
[scripts/bench/](../../scripts/bench/README.md). The rules are Ghostty's benchmark rules
(`ghostty@d69f9ed:src/benchmark/AGENTS.md`), adapted ([research-ghostty.md](research-ghostty.md)).

## The rules

1. **Write the bar before measuring.** The brief states the number that ships it, and the number that
   doesn't, before the first run. A bar written after the numbers is a description, not a test.
2. **"Measured, not built" is a valid end.** A brief whose change doesn't pass its bar closes with the
   numbers in its outcome and no code; that is the brief doing its job.
3. **Generate inputs once, keep them out of the repo.** Everything lives in
   `$XDG_CACHE_HOME/imbatranim-bench/` (default `~/.cache/imbatranim-bench/`). The same files are reused
   across revisions; check their sums before comparing.
4. **Fixed seeds.** `node scripts/bench/generate.mjs` makes the synthetic inputs from fixed seeds; the same
   bytes come out on any machine (`node --test scripts/bench/generate.test.mjs`).
5. **One runner:** `node scripts/bench/run.mjs <workload.mjs>` does two warmups and ten runs, and reports
   the median and the 95th percentile with the machine and the cap beside them. It saves each result under
   `results/`.
6. **Never two benchmarks at once on one machine.** The runner's lock file refuses a second run.
7. **Production's cap.** The container runs with one CPU and 1 GiB. In the dev container set it with cgroup
   v2, as brief 89 did: `echo "100000 100000" > /sys/fs/cgroup/cpu.max` and
   `echo 1073741824 > /sys/fs/cgroup/memory.max` (from a root shell in the container); the runner reads both
   files and records them.

## The inputs

| File | What | sha256 |
|---|---|---|
| `plain-50mb.txt` | 50 MB of printable ASCII lines, 20 to 120 characters (52,428,766 bytes) | `172d3b85fc1be5558272d1b62b533377c0f2aa4e05337f72c6edf8a034130c69` |
| `sgr-20mb.txt` | 20 MB of SGR-heavy lines: 256-colour, truecolour, bold, underline (20,971,409 bytes) | `052eb3bd9ff85a84a6a551b0c5a3f68aceb9a17033d58db92316a64435a4feb9` |
| `cjk-20mb.txt` | 20 MB of ASCII mixed with CJK ideographs and emoji (20,971,457 bytes) | `2e6de62abbe049de7a68110d7bc035c882448347b0e708601ecde3c5d7018b6c` |

## The recordings

Real sessions, as asciicast v2 (asciinema's format), made by `record.mjs` under a PTY; `replay.mjs` plays
one without its pauses. Unlike the inputs they are machine output, so their sums identify a recording to
reuse rather than one to regenerate. Recorded 2026-11-22 on the host (Docker's daemon was down), 120 by 40:

| Recording | Command | sha256 |
|---|---|---|
| `ls-lR-usr.cast` | `ls -lR /usr` (6.8 MB of output) | `82234fc191dbba3d819d25a2f5911c2eb85dcd9f693dcd32d007e17d41c0c2af` |
| `git-log-p.cast` | `git log -p \| cat` on this repo (14.7 MB) | `748c4e0107100de6f99af2a961b4cb11709cbe2f7b66b47e458170478f7a1376` |
| `top-10s.cast` | `timeout 10 top`, redrawing | `54fe1e7e4296ed8613bf9b7eb838cc3ea2d66fc19f56b5d4185caf4215b4823d` |
| `vi-scroll.cast` | BusyBox `vi package-lock.json`, 120 pages down | `cfd7bb1647aee5c19078ab3c1ffa09f4ad2d0d06ddb7c0c9073ec5997f4a5055` |
| `npm-ci.cast` | `npm ci --loglevel verbose` in a scratch package of three dependencies | `ec81d7933b4325254e886f37ad920b37cd269e8103f60742613cf65d139fb8f8` |

Re-recorded in the dev container they will have other sums; record those here when they are made.

## The baseline: a 50 MB cat through the Terminal

`workloads/terminal-cat.mjs`: `cat plain-50mb.txt` in a desktop Terminal window, through the PTY, the
socket and xterm in headless Chromium (Playwright), timed in the page from the first socket message after
the command to the frame that shows the end marker. Measured 2026-11-22 on the host, not the dev container
(Docker's daemon was down): the backend and the desktop ran directly, the shell was Alpine's BusyBox ash.
The machine: 4 vCPU Intel Xeon at 2.1 GHz, 15.7 GiB, Node 24.22.3.

| Cap | Median | p95 |
|---|---:|---:|
| none (backend, browser and Vite share four CPUs) | 2,733 ms | 3,100 ms |
| backend (and so the PTY and `cat`) pinned to one CPU with `taskset -c 0`; no memory cap | 2,434 ms | 2,734 ms |

The pinned run is faster: the browser, which does the rendering, no longer shares a core with the backend.
The number under production's full cap (one CPU and 1 GiB on the container) is the dev container's to take;
until then 113 and 114 compare against the pinned row, on this machine.
