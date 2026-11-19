---
title: An archive extract reports zero bytes under load
created: 2026-11-19
status: promoted
tags: [bug, files, backend, tests]
---

# An archive extract reports zero bytes under load

Promoted 2026-11-19 to [brief 93](../briefs/todo/93-an-archive-extract-counts-its-bytes-every-time.md).

Under parallel test load (`npm run check`, with the other workspaces' tests
running beside it), `apps/backend/src/modules/archive/archive.compressed-file.spec.ts`
sees `totalBytes: 0` for a lone `.xz` and `.bz2` file where it expects the
text's 900 bytes; the result's `dest` and `entries: 1` are right. Whether
the bytes reached the file isn't known: the test stops at the count, before
it reads the file. Run alone, the spec passes. Seen by brief 89's builder on 2026-11-17; on
2026-11-19 a full `npm run check` passed with it.

Find out which it is:

- the count can really come back 0 when the decompressor is slow (for
  example, the bytes are counted on a stream event that fires before or
  after the total is read, or `xzcat`/`bzcat` exiting is taken as the end
  before their output is drained), and Files would then tell the owner an
  extract of 0 bytes; or
- only the test races: something in it reads the result before the
  extract has finished counting, which only shows when the machine is slow.

Then fix the cause, not the test's timing.
