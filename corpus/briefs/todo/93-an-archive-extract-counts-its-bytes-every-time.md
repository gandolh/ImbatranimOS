# Task 93: An archive extract counts its bytes every time

**Depends on:** nothing.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of the same day
([todos/archive-extract-reports-zero-bytes-under-load.md](../../todos/archive-extract-reports-zero-bytes-under-load.md)),
in the owner's backlog grill: a diagnose brief (the controller's call).

## Context

Under parallel test load, `apps/backend/src/modules/archive/archive.compressed-file.spec.ts`
sees `totalBytes: 0` for a lone `.xz` and `.bz2` file where it expects 900;
`dest` and `entries: 1` are right. Alone it passes (41/41). Seen on
2026-11-17 and 2026-11-19 (once failing, once passing in a full
`npm run check`). Whether the bytes reached the file isn't known: the test
stops at the count.

Two candidates (the todo's): the count can really come back 0 when the
decompressor is slow (a stream event counted before or after the total is
read, or `xzcat`/`bzcat` exiting taken as the end before their output is
drained), which Files would show the owner as an extract of 0 bytes; or
only the test races.

## Files you OWN

- `apps/backend/src/modules/archive/` (the service and its specs)
- Corpus: `wiki/status.md`, `log.md`, the todo (delete it at closeout)

## What to do

Follow the `diagnose` skill:

1. A deterministic loop first: make the decompressor slow on purpose (a
   wrapper that delays or trickles its output, or a fake child process in
   the spec) so the 0 shows every time, not only under load.
2. One hypothesis at a time, from the loop.
3. Fix the cause in the service (not the test's timing), and keep the loop
   as a regression test that also reads the extracted file's bytes.

## Acceptance

- [ ] The slow-decompressor test fails on today's code and passes after the
      fix, and checks the file's content, not only the count.
- [ ] The spec passes in three full `npm run check` runs.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy` (owner step `node cli.ts imbatranim-os
      server`) if the service changed, else `done`.
