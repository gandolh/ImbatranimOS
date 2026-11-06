---
title: Files extracts a lone compressed file
created: 2026-11-06
status: open
tags: [imbatranim-apps, files]
---

# Files extracts a lone compressed file

A lone `.gz`, `.xz` or `.bz2` file (not a tarball) fails in Files with
"Unsupported archive format". The archive backend's `detectFormat` only knows
the zip and tar flavours. Found while building brief 66; accepted then.

Open question: unpack it next to the file as the same name without the suffix,
or into a folder like the other archives.
