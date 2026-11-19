# Task 93: An archive extract counts its bytes every time

**Depends on:** nothing.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of the same day
(`archive-extract-reports-zero-bytes-under-load`, deleted at closeout),
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

## Outcome (2026-11-19)

Built: a service bug, fixed. Ready for deploy: `node cli.ts imbatranim-os
server` from vps-deploy. One code commit, `2e3b4bf` (1.348.0), local.

**The answer.** Not a test race: the extract really counted 0 bytes, and it
placed an empty file, with no error. Files would have shown the owner an
extract of 0 bytes and an empty `notes.txt`.

**The cause.** `xzcat` and `bzcat` are child processes. `decompressNow`
started one with the archive as its stdin, then awaited closing that
descriptor, and only then piped the child's stdout into the counter and the
file. Node's `child_process`, once a child exits, resumes any stdout nobody
reads yet (`flushStdio`, on the next tick), so its bytes go to no one and
the stream ends. A small file's decompressor is done in a millisecond; on a
busy server the close, queued in libuv's thread pool behind other work,
finished after it. The pipeline then met an ended stream: 0 bytes, exit
code 0. A probe at the child's exit showed stdout with no `data` listener
and `readableFlowing` null. The format peek runs the same code, so a `.xz`
or `.bz2` holding a tar could read as a lone file the same way. gzip never
had it: Node's own zlib, no child.

**The fix.** Nothing is awaited between starting the child and giving its
stdout a reader; the descriptor closes once the child is done (the child has
its own copy). The missing-command 500, the damaged-file 400, the timeout
and the kill-then-wait are unchanged.

**The loop** (`apps/backend/src/modules/archive/archive.busy-server.spec.ts`,
kept as the regression test). First the brief's guess, a slow decompressor:
wrappers that delayed their start by 300 ms, trickled their output line by
line, or lingered after writing all gave 900 bytes and a full file, so that
candidate is ruled out. The spec instead makes the server busy, exactly: it
wraps `spawn` and, from each spawn until that child has closed, holds every
thread of libuv's pool (each blocks opening a FIFO, freed by a read-write
open). Any fs call the service awaits in that window lands after the child
is gone. A `.xz` and a `.bz2` check the file's bytes, then the count; a
`.xz` holding a tar checks it still unpacks as a folder. On the old service
it failed 20 runs of 20 (an empty file, `totalBytes: 0`); after the fix it
passed 20 of 20, and the committed spec was run once more against each.

**Deviations.**

- The Acceptance names a slow-decompressor test. The kept test slows the
  server, not the decompressor, because the slow decompressor never showed
  the bug; the brief allows a fake child in the spec, and this is the
  measured shape of "under load".
- A new spec file rather than a block in `archive.compressed-file.spec.ts`:
  it mocks `child_process` for the whole file, and the other 41 tests stay
  on the plain module.
- The `log.md` entry is of kind `incident`, which the log has not used
  before; the `diagnose` skill names it.
- The two links to the deleted todo (this brief's first lines and brief 89's
  log entry) are plain text now, so the corpus lint stays clean.

**Checks.** `npm run check` exit 0 three times at 1.348.0, the backend's
jest run each time (75 suites, 1 102 tests; its turbo cache entry removed
before the second and third, while the other workspaces replayed from
cache). One `npm run check` with `TURBO_FORCE=true`, every workspace's tests
at once, exited 1: two web tests outside this brief timed out at 5 s (the
kit's RadioGroup arrow keys, File Manager's background menu) and turbo
cancelled the backend's run. The archive and backup specs together: 9
suites, 143 tests, exit 0. `bash corpus/lint.sh` OK.

**Owner steps.** Deploy as above. Then, in Files, extract a small `.xz` and
`.bz2` text file: the file has its text and the size is right.
