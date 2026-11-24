# Brief 118: Marketplace apps from verified prebuilt output

**Depends on:** nothing. **Runs after:** 117.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-24 from [research-deploy-infrastructure.md](../../wiki/research-deploy-infrastructure.md), at the
owner's call the same day: Marketplace apps keep building from source on the box for now, and this brief holds the
alternative for later.

## Context

- Installing or updating a catalog app clones imbatranim-apps at the pinned commit into `~/.imbatranim/apps`, runs
  the descriptor's install and build there (`npm ci --workspace=<suite>`, then `npm run build:os`), and serves the
  build's output ([decisions-marketplace.md](../../wiki/decisions-marketplace.md)). Building the verified commit on
  the box is the trust model: what runs is what was reviewed.
- Measured 2026-11-24 for Accessories (Todo and Bookmarks): the install step peaks at 303 MB resident and the build
  at 448 MB, on the same CPU and under the same 1 GiB cap as the desktop on the VPS; the output the desktop serves is
  144 KB. Each install downloads into a shared npm cache that only grows.
- **imbatranim-office can't be installed under the production cap.** Its `npm run build:os` peaks at 1.96 GB
  resident (`npm ci` at 660 MB); in a `node:24.22.1-alpine` container with 1 GiB and no swap, as production runs,
  the build is OOM-killed within seconds, and still is with V8's heap capped at 384 MB, one Rayon thread and one libuv
  thread (2026-11-24): the memory is native, in the bundler. Built output (33 MB for the whole suite) would install
  in a fraction of that.
- imbatranim-apps' `verified.json` already names the commits that count as verified, and
  `npm run verified:sync` copies it into this repository, so the pin travels with an OS release.

## Decisions (to settle before building)

1. **The artifact.** A tarball of one suite's build output at one commit, built by the owner from that commit with
   the same install and build steps, published where the box can fetch it (a GitHub release asset of imbatranim-apps
   is the first candidate; the deploy is build-from-source, so no registry is assumed).
2. **What makes it trusted.** Its SHA-256 sits in `verified.json` beside the commit, so a tarball is accepted only
   when its digest matches what was reviewed and synced into the OS. No digest, or a mismatch: the install builds
   from source exactly as today.
3. **What stays.** Source builds remain the path for unverified apps, apps from a URL, apps with a server, and any
   verified commit without an artifact.

## What to measure (the bar, before building)

- Install time, peak memory and disk written for each catalog suite, from source and from the artifact, on the
  production cap.
- Ship only if an install from the artifact uses at least 5× less peak memory and CPU time than a source build, and
  a tampered or mismatched tarball is refused (a test).

## Files you OWN

- `apps/backend/src/modules/marketplace/` (the install path, `verified.ts`, specs, e2e).
- `scripts/verified-sync.mjs` and its test.
- imbatranim-apps: `verified.json`'s format and the tool that produces an artifact (a brief there).

## Acceptance

- [ ] Both sets of numbers written on the research page.
- [ ] A verified artifact installs, a mismatched one is refused and falls back to a source build, and an app with a
  server still builds from source.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.

## Outcome (2026-11-24)

**Built in both repositories** (`6301804` here; imbatranim-apps' `npm run prebuilt`), at the owner's call that day.
Two choices differ from the decisions above:

- **The digest lives in the catalog descriptor, not `verified.json`.** `verified.json` lists apps installed from a
  URL; the catalog suites, Office among them, are pinned by their descriptors in this repository. `build.prebuilt`
  (`url`, `sha256`, `commit`) sits beside `source.ref`, `commit` must equal it, and the same review covers both.
- **An app with a server installs from its archive too**, and installs its server's own dependencies from source
  (`server.install`, now required with an archive): Office is a service app, and it is the reason for the brief.

The archive is a deterministic gzipped ustar (folders and regular files only); the OS unpacks it with its own
small reader (`prebuilt.ts`) and refuses links, devices, pax or GNU headers, paths out of the output, bad checksums
and truncated archives. Any failure is logged and the install builds from source.

**The bar was met.** Under a cgroup of 1 GiB with no swap, imbatranim-apps at `776182b`, two runs each:

| | From source | From the archive |
|---|---:|---:|
| Accessories: wall, CPU | 6.6 s, 8.8-9.5 s | 1.0 s, 0.4-0.5 s |
| Accessories: peak RSS above idle | about 385 MB | about 6 MB |
| imbatranim-office | killed by the cap in `build:os` (exit 137) | installed: 4.6 s, 6.6 s of CPU, 177 MB at peak |

The build steps reached npm through this sandbox's proxy for the measurement only (a patched `dist`, rebuilt
after). Accessories' archive came out with the same SHA-256 from two builds; Office's is 8.1 MB. The e2e tests
install from an archive whose build command fails, fall back from a wrong digest and refuse a stale commit.

**Owner steps:** run `npm run prebuilt -- <group>` in imbatranim-apps at the commit a descriptor pins, upload the
archive as a release asset under the printed URL, and copy the printed block into the descriptor's `build`. The
catalog names no archive until then, so installs build from source as before.

`npm run check` exit 0 in both repositories; `bash corpus/lint.sh` OK. brief-board isn't installed in this
session, so the `ready_for_deploy` move is the owner's.
