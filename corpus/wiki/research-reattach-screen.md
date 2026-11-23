---
summary: Brief 103's measurement (2026-11-22). A headless xterm beside each pty restores every screen exactly, the ring doesn't after a long-lived mode falls out of it, but the headless one costs 3.7 times the backend CPU and about 9.7 MB more per Terminal, so the 256 KiB ring stays and the headless restore isn't built.
updated: 2026-11-22
---

# Restoring a reattached Terminal's screen: measured

[Brief 102](../briefs/done/102-a-terminals-shell-outlives-a-close-it-didnt-mean.md) gives a window back
its shell after a reload with a reset, the shell's last 256 KiB of output and a resize. Brief 103 asked
whether a headless xterm fed beside each pty, serialized on reattach, restores the screen better for a price
the backend can pay. The bar was written first ([how-we-measure.md](how-we-measure.md), rule 1): build it
only if the ring gets a screen wrong **and** the headless restore costs at most 10% more drain time, 10% more
backend CPU and 8 MB more RSS per Terminal.

**Verdict: measured, not built.** The ring does get a screen wrong, but the headless restore costs 265% more
backend CPU against a bar of 10%, and 9.7 MB more per Terminal against 8 MB.

## Method

- **Where.** The host, not the dev container (Docker's daemon was down): 4 vCPU Xeon at 2.1 GHz, Node
  24.22.3, the backend pinned to one CPU with `taskset -c 0` (the pinned row of how-we-measure.md), no
  memory cap; Alpine's BusyBox ash as the shell; the desktop in headless Chromium at 1280 by 800.
- **The headless restore** was a throwaway patch on brief 102's session, never committed:
  `@xterm/headless` 6.0.0 and `@xterm/addon-serialize` 0.14.0 from a scratch folder, one terminal per pty
  at its size with 5,000 lines of scrollback (the tab's), fed every chunk in place of the ring, resized with
  the pty, and `serialize()` sent after the reset on reattach.
- **Cost.** `scripts/bench/run.mjs` with `workloads/terminal-cat.mjs` (two warmups, ten runs) on the 50 MB
  plain input and the 20 MB SGR input, one backend start per row; the backend's CPU time read from
  `/proc/<pid>/stat` around the twelve cats. RSS: four shells opened over the socket, each filled with 8,000
  lines (`head -n 8000` of the plain input), `VmRSS` read before and 4 s after, twice per restore.
- **Quality.** For each screen, a fresh Terminal window ran the command, the page reloaded, and the
  window's screen before and after was compared two ways: the DOM rows (text and attributes, the cursor's
  own classes left out) and a pixel diff of `.xterm-screen` (focus moved off the terminal so the cursor draws
  the same). The screens: brief 101's five recordings cut at half their output events and `cat`-ed, `vim`
  with a vertical split, `less` three pages into `package-lock.json`, and `top -d 100` (htop isn't
  installed on the host). Then the case the brief named: `less` paged 400 times, so its alternate-screen
  and keypad switches fall out of a 256 KiB ring, quit after the reload, compared with the same quit in a
  window that never reloaded.

## The numbers

| | Ring (shipped) | Headless xterm | Change | Bar |
|---|---:|---:|---:|---:|
| 50 MB plain `cat`, drain median (p95) | 2,034 ms (2,166) | 2,199 ms (2,466) | +8.1% | 10% |
| 20 MB SGR `cat`, drain median (p95) | 1,834 ms (2,382) | 1,950 ms (2,200) | +6.3% | 10% |
| Backend CPU per 50 MB `cat` | 365 ms | 1,334 ms | +265% | 10% |
| Backend CPU per 20 MB SGR `cat` | 218 ms | 717 ms | +229% | 10% |
| Backend RSS per Terminal, 8,000 lines in | 1.6, 1.7 MB | 11.3, 11.5 MB | +9.7 MB | 8 MB |

Drain time barely moves because the browser, not the backend, is what drains slowest on this machine; the
backend's CPU is what the production cap (one CPU for the whole container) would feel, on every byte of
every Terminal. The RSS figure for headless includes, spread over the four shells, xterm's code loading
once.

| Screen across a reload | Ring | Headless |
|---|---|---|
| The five recordings at half (`ls -lR`, `git log -p`, `top`, BusyBox `vi`, `npm ci`) | exact (0 rows, 0 pixels) | exact, except `top`'s: one cell on the last row, the cursor's |
| `vim -O` with two files | exact | exact |
| `less`, three pages in | exact | exact |
| `top -d 100` | exact | one cell on the last row, the cursor's |
| `less` paged 400 times: the screen | exact | exact |
| ...then quit, against a window that never reloaded | **26 of 27 rows differ** | exact |

The ring's one miss is the one the brief predicted. The visible page comes back right, but the xterm doesn't
know it is on the alternate screen any more, so quitting leaves the pager's last page where the shell's own
screen should return. The mode of keys (application cursor keys) is lost the same way.

## What would change the call

- A cheaper parser beside the pty. libghostty-vt has snapshots and is the candidate once it reaches 1.0
  (the todo in [research-ghostty.md](research-ghostty.md)); measure it against this table.
- Keeping the modes without a terminal. A small state tracker that watches only the mode-setting sequences
  (`?1049`, `?1`, `?2004`, mouse modes) and replays them before the ring would fix the `less` case for a
  fraction of the cost. Not filed: it would need its own bar and its own brief.
