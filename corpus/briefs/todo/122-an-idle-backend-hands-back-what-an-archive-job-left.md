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
