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
