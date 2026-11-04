# Brief 27 — The image is the same size after a source build

## Context

Found while measuring the production image on 2026-10-28. The `proddeps`
stage of `infrastructure/Dockerfile` runs
`npm ci --omit=dev --workspace=backend`. `better-sqlite3`'s install script
is `prebuild-install || node-gyp rebuild --release`. When the prebuilt binary
downloads, `build/Release` holds only `better_sqlite3.node` (2.4 MB). When it
doesn't (it failed once under a load average near 40), node-gyp compiles
from source, and the strip step that follows deletes `*.o` files and
`obj.target` dirs but leaves `build/Release/obj/` (about 10 MB, the
generated sqlite sources), `sqlite3.a`, `test_extension.node`, `.deps` and
the makefiles. The image grew from 279.6 MB to 291.0 MB with no change of
its own. The Dockerfile's comment says `iso/scripts/build-payload.sh`
strips the same way, so both pipelines must change together. Promoted from
the todo `native-build-leftovers-in-the-image`.

## Spec

1. In the strip step, remove everything in `better-sqlite3/build` except
   `build/Release/better_sqlite3.node`.
2. Check node-pty's `build/` after a source build for the same pattern, and
   keep only the `.node` files it loads at run time.
3. Make `iso/scripts/build-payload.sh` strip identically.

## Must preserve

- The backend still loads both native modules in the production image.

## Acceptance

- A source build of `better-sqlite3` and a prebuilt one leave the same
  files under `better-sqlite3/build` and `node-pty/build`. Check it by
  forcing the source build once (for example
  `npm_config_build_from_source=true`) in the `proddeps` stage, on a quiet
  machine, and list the files; put the image sizes of both builds in the
  outcome.
- The production image starts and the backend opens its database and a
  Terminal.

## Files you OWN

- `infrastructure/Dockerfile` (the strip step)
- `iso/scripts/build-payload.sh` (the matching strip)

## Files you must NOT touch

- The `deps`, `manifests` and `dev` stages of `infrastructure/Dockerfile`,
  which brief 22 owns.

## Outcome (2026-11-03)

**Built in `f44b968` (version 1.119.0).** After the existing strip, each native
module's `build/` is emptied but for the binary it loads
(`better-sqlite3/build/Release/better_sqlite3.node`,
`node-pty/build/Release/pty.node`): the binary is moved aside, `build/`
removed and recreated, the binary put back. A module without a `build/` is
skipped (a future node-pty with Linux prebuilds); a `build/` without its
binary fails the build. node-pty loads `build/Release`, then `build/Debug`,
then `prebuilds/<platform>-<arch>`; its `spawn-helper` is macOS-only, so
Linux needs `pty.node` alone. Before, its `build/` always kept its
makefiles, `config.gypi` and an inner `node_modules` of `.mk` files
(164 KB, now 88 KB). `iso/scripts/build-payload.sh` strips identically; the
ISO itself wasn't built (the kiosk build is heavy and deferred).

**Measured** (production image, this sandbox; `docker image inspect` sizes):

| Build | better-sqlite3 | Strip | Image | `better-sqlite3/build` |
|---|---|---|---|---|
| before | prebuilt | old | 508,896,611 B | 2,320 KB, the `.node` only |
| before | source (forced) | old | 525,742,888 B | 14,980 KB: `obj/gen` sqlite sources, `sqlite3.a`, `test_extension.node`, `.deps`, makefiles |
| after | source (forced) | new | 508,807,306 B | 2,248 KB, the `.node` only |
| after | prebuilt | new | 508,812,652 B | 2,320 KB, the `.node` only |

The two "after" builds list the same files under both `build/` dirs; only
the compiled binary's size differs from the downloaded one. The source build
was forced with `ENV npm_config_build_from_source=true` in `proddeps`, in
the test copy of the Dockerfile only. Both "after" images start healthy, set
up a database on first visit and run a Terminal (`echo pty-$((6*7))` printed
`pty-42`, `whoami` `imbatranim`).
