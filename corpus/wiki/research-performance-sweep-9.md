---
summary: Rounds 41-45 of the performance sweep in full. Round 41 had the Trash list its items with synchronous reads (2,000 items 345 to 25 ms). Rounds 42 and 43 found emptying the Trash and expired sessions not worth a change. Round 44 found that a compress or an extract leaves 37-121 MiB of dead Buffers that V8 frees only at a major GC, which an idle backend never runs (the runtime image's backend rested at 241 MiB after compressing, 101 MiB after a forced GC), and filed it as brief 122. Round 45 closed clean: today's desktop loads what round 27's did, and rests at 0.08% of a core.
updated: 2026-11-25
---

# The performance sweep, rounds 41-45

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).
Rounds 36-40 are on [research-performance-sweep-8.md](research-performance-sweep-8.md).

## Round 41 (2026-11-25): listing the Trash

**The bar, written after the baseline and before any change:** 2,000 items in the Trash; wall and CPU down at least
60% (median of ten, interleaved builds), the same rows in the same order, the event loop held at most 50 ms.

**What it was.** For each item, an awaited `readFile` of its info file (open, stat, read, close: four trips through
the thread pool) and an awaited `lstat`, one item after another.

**What changed** (`12352ab`). `readFileSync` and `lstatSync`, 256 items between yields, as a folder listing reads.

| 2,000 items, medians of ten | Before | After |
|---|---:|---:|
| Wall | 334-362 ms | 25-28 ms |
| Backend CPU | 330-340 ms | 20-30 ms |

Both builds at once (two ports) answered with the same bytes.

## Round 42 (2026-11-25): emptying the Trash; measured, not built

2,000 items: 0.84-0.99 s, 0.50-0.62 s of CPU, /health's worst 6 ms. Async, rare, and under a second.

## Round 43 (2026-11-25): expired sessions; measured, not built

Expired `local_session` rows stay until a sign-out clears them. The table is keyed by the token's hash, so a lookup
does not grow with it, and a row is a few dozen bytes: a sign-in a day for years is kilobytes. Also looked at and
left: Backup sizes the home with `dirSize` (round 11's batched walk) and streams through `tar`; a Marketplace service
app's server already gets a heap cap, and its work (libredwg in WebAssembly) is memory a young-generation cap does
not govern; there was no DWG sample here to measure it with.

## Round 44 (2026-11-25): what an archive job leaves behind; filed as brief 122

Compressing the 5,668-file folder ten times on the glibc host took the backend from 118 to about 330 MiB at rest,
level after the fourth run, most of it in glibc's main heap. The image is Alpine, so the same ran in the runtime image
(`imbatranimos:1.0`, today's backend mounted over its own): 105 MiB at rest before, 241-257 MiB after each compress,
once 115. Through the inspector:

| The runtime image's backend | RSS | `arrayBuffers` |
|---|---:|---:|
| After ten compresses, at rest | 242 MiB | 121 MiB |
| After a forced major GC | 101 MiB | 0 |
| After one extract of the same tree, at rest | 170 MiB | 37 MiB |
| After a forced major GC | 102 MiB | 0 |

The memory is Buffers already dead: each small file read whole, each deflated or inflated chunk. V8 frees a Buffer's
memory when a major GC collects its handle, and it schedules one by how fast external memory grows; once the job
ends nothing grows, and an idle backend never runs one. Nothing leaks (it levels off and a GC takes it all), but the
box's 1 GiB holds 70-140 MiB of garbage after any large archive job. Brief 122 measured a GC after each job: 130 MiB back at rest, and the next job 16% slower (a job that starts
clean runs more GCs of its own), so it was left.

## Round 45 (2026-11-25): the closing check

**The bar, written before measuring:** on a fresh home, the cold load's wire and the JS and CSS it decodes within 5%
and 2% of round 30's, a warm reload fetching nothing, the walk (Start, Calculator, Files) logging no error, and the
empty desktop at rest at or under round 30's 0.11% of a core (0.12% allowed).

This round's harness counts what round 30's did not (headers, what loads in the 2.5 s after the taskbar, and
memory-cache hits as fetches), so it was run on round 27's build, the one round 30 measured, and on today's:

| Fresh home, same harness | Round 27's build | Today's build |
|---|---:|---:|
| Cold wire to the taskbar and 2.5 s | 405.3 KiB, 44 requests | 405.2 KiB, 44 requests |
| JS and CSS decoded | 985.7 KiB | 985.7 KiB |
| Warm reload, assets the harness saw | 29 (all `immutable`) | 29 (all `immutable`) |
| The walk | — | no console error |
| Empty desktop at rest, 60 s | 0.11% (round 30) | 0.08%, 11 commits, 3 requests |

The load is the same to a tenth of a KiB, and the assets carry `max-age=31536000, immutable`, so the 29 are the
harness's count, not fetches. No regression.
