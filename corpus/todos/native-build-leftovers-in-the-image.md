---
title: A source-built better-sqlite3 leaves 12 MB in the production image
created: 2026-10-28
status: open
tags: [image, docker, size]
---

# A source-built better-sqlite3 leaves 12 MB in the production image

Found while measuring brief 165's image on 2026-10-28. The `proddeps` stage
of `infrastructure/Dockerfile` runs `npm ci --omit=dev --workspace=backend`.
`better-sqlite3`'s install script is `prebuild-install || node-gyp rebuild
--release`. When the prebuilt binary downloads, `build/Release` holds only
`better_sqlite3.node` (2.4 MB). When it doesn't (it failed once under a load
average near 40), node-gyp compiles from source, and the strip step that
follows deletes `*.o` files and `obj.target` dirs but leaves
`build/Release/obj/` (about 10 MB, the generated sqlite sources),
`sqlite3.a`, `test_extension.node`, `.deps` and the makefiles: the image grew
from 279.6 MB to 291.0 MB with no change of its own.

Removing everything in `better-sqlite3/build` except
`build/Release/better_sqlite3.node` in that strip step would make the image
the same size either way. Check node-pty's build dir for the same pattern.
