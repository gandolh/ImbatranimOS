# Brief 121: copying a folder runs at the file system's pace

**Depends on:** nothing. **Runs after:** 120.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-25 from the performance sweep's round 36
([research-performance-sweep-8.md](../../wiki/research-performance-sweep-8.md)). Measured, not built: the change met
every part of its bar but the size of the win, and the bar asked for more than the kernel allows.

## Context

- `FilesService.copy` copies a folder with `fs.promises.cp`, a JavaScript walk with several awaited calls per entry.
- Round 36 tried `copyTree`: `readdirSync` with file types, `copyFileSync` for files up to 1 MB and the thread pool
  above, `mkdirSync`, links recreated as `fs.cp` makes them (a relative target resolved against the source), a yield
  every 64 entries, and a folder's mode set after its contents.
- 5,668 files (69 MB), 18 runs a build over six interleaved sets: `fs.cp` 4.8 s of the backend's CPU (median),
  `copyTree` 2.1 s (-56%), `cp -a` 2.0 s. A profile put nearly all of `copyTree`'s time in the kernel's file creation
  (about 350 µs a file on that disk), the floor `cp -a` pays too: 42% of `fs.cp`'s time, so the round's -60% bar
  could not be met by any change in the backend. On Node 24 the same.
- The trees came out identical (types, modes, bytes, links and their targets), and /health's worst was 39 ms.
- Setting a folder's mode before copying into it fails for a read-only folder under any user but root; the spec has
  a 0555 folder and must pass as a user who isn't root.

## Decisions (to settle first)

1. **Whether to ship it against a bar anchored to the floor** (recommended): the user-space cost of a copy, what it
   takes beyond `cp -a` on the same tree, falls at least 80%, and the CPU at least 50%. The alternative is to leave
   `fs.cp`, which is correct and twice as slow.

## The bar (written 2026-11-25, after round 36's numbers: say so in the outcome)

- On 5,668 files, interleaved with `fs.cp` and `cp -a` in the same sets: `copyTree`'s CPU at least 50% under
  `fs.cp`'s and within 15% of `cp -a`'s (medians); the same tree; /health under 100 ms; the spec passing as root and
  as a user who isn't.

## Acceptance

- [ ] Measured on Node 24, the bar above.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.

## Outcome (2026-11-25)

Measured again, not built. The call went to the recommended option (ship against the floor-anchored bar), and the
bar, written after round 36's numbers, was missed on one of its two counts.

- On Node 24, the backend as the image runs it, 5,668 files, three interleaved sets of three runs each (`fs.cp`,
  `cp -a`, `copyTree`): backend CPU medians `fs.cp` 4.6 s (1.9-5.1), `cp -a` 2.17 s (2.06-2.37), `copyTree` 2.4 s
  (2.2-2.6). Within 11% of `cp -a` (the bar allowed 15%), but 48% under `fs.cp` where it asked 50%. The trees were
  the same, and /health's worst was 36 ms.
- The first set ran `fs.cp` at 1.9 and 2.9 s, faster than `cp -a`'s own 2.07: a fast phase of this VM's disk, which
  is what made its median low. Neither dropping those runs nor adding sets after the fact counts, so the change stays
  out. It is a 40-line function with its spec (a read-only folder, run as root and as `nobody`), described in round 36
  ([research-performance-sweep-8.md](../../wiki/research-performance-sweep-8.md)); on a disk without those phases, it
  would want measuring again.
