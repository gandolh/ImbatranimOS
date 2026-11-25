# Brief 122: an idle backend hands back what an archive job left

**Depends on:** nothing. **Runs after:** 121.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-25 from the performance sweep's round 44
([research-performance-sweep-9.md](../../wiki/research-performance-sweep-9.md)). Measured, not built: the cleanest fix
adds a flag to the backend's command line, so it is the owner's call.

## Context

- In the runtime image (`imbatranimos:1.0`, Alpine, with the backend of 2026-11-25 mounted over its own), compressing
  the 5,668-file folder took the backend from 105 MiB at rest to 241-257 MiB at rest, ten times running; one extract
  of the same tree left it at 170 MiB.
- Through the inspector: 121 MiB of `arrayBuffers` after the compresses and 37 MiB after the extract, all of it dead.
  A forced major GC took the backend to 101-102 MiB and `arrayBuffers` to 0.
- The Buffers are the job's own: each small file read whole and deflated, each inflated chunk. V8 frees a Buffer's
  memory when a major GC collects its handle and schedules one by how fast external memory grows, so once the job
  ends, nothing triggers one. It levels off (no leak), but the box's 1 GiB carries 70-140 MiB of garbage after any
  large archive job, beside Firefox and the Linux apps.

## Decisions (to settle first)

1. **How to hand it back.**
   - **A major GC when an archive job ends** (recommended): `--expose-gc` beside `--max-semi-space-size=2` on the
     image's `CMD` (not in `NODE_OPTIONS`, which a Terminal's shell would inherit), and the archive service calls
     `gc()` once after a compress or an extract, when the flag is there. In development the flag is absent and
     nothing runs. One GC on a heap of about 30 MB after a job of seconds.
   - **Allocating less:** read small files into reused buffers when compressing. Helps compressing only, by about
     the share of the reads, and more code.
   - **Leave it:** bounded, and taken back at the next busy moment.

## The bar (written 2026-11-25, before building)

- In the runtime image: after ten compresses of the 5,668-file folder, and after one extract, the backend rests
  within 20 MiB of where it started; a compress's wall time grows no more than 5%; /health's worst stays under 50 ms
  while the GC runs.

## Acceptance

- [ ] Measured in the runtime image, the bar above.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.

## Outcome (2026-11-25)

Measured, not built. The call went to the recommended option (a major GC through `--expose-gc` when a zip job ends),
and it met the memory half of the bar and missed the other.

- In the runtime image, three interleaved pairs: after each of ten compresses the backend rested at 113-116 MiB
  (start 106-107) against 240-254, and at 122-123 MiB after the extract against 147-151; /health's worst 29-72 ms.
  But a compress took 2.83-2.91 s (medians) against 2.44-2.47 s: +16%, where the bar allowed 5%.
- The cost is not the GC. A job that starts with no garbage in the heap runs more GCs of its own: the build without
  the change took 2.80-2.82 s for its first compresses too, and 2.36-2.56 s once it carried the last job's 120 MiB.
  So whatever frees the memory makes the next large job about 0.35 s slower.
- Collecting once zip jobs had stopped for 30 s instead was measured too, and was worse on both counts: after a
  burst the freed memory stayed resident (148-188 MiB, a further GC changing nothing), and a lone compress after the
  quiet spell still took 2.62-2.75 s against 2.22-2.37.
- What is left for the owner: 130 MiB back at rest after a large zip job, for 0.35 s on the next one. Allocating less
  (reading small files into reused buffers when compressing) would cut both the garbage and the GCs a job runs, and
  is the next thing to measure.
