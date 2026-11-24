---
summary: Rounds 16-20 of the performance sweep in full. Round 16 researched and ranked deploys and infrastructure (research-deploy-infrastructure.md), wrote brief 117, and reverted round 12's PTY join after measuring it pinned to one CPU. Round 17 made a deploy build the image's slow parts once, as local tagged bases (infrastructure/image.sh): a code-only deploy after a pruned build cache 181 to 28 s. Round 18 measured Marketplace builds at a lower CPU priority and left it. Round 19 gave a service app its server's own install (imbatranim-office 964 to 86 MB) and found its build can't fit the 1 GiB cap; round 20 rebased the dev image on the runtime base (a dependency change 85 to 48 s).
updated: 2026-11-24
---

# The performance sweep, rounds 16-20

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md). On
2026-11-24 the owner asked for fifteen more rounds, a ranked look at deploys and infrastructure for ImbatranimOS and
imbatranim-apps, and the winners built.

## Round 16 (2026-11-24): deploys and infrastructure, researched; round 12 reverted

**The research.** [research-deploy-infrastructure.md](research-deploy-infrastructure.md) holds the method, the
numbers and the ranking. The owner's answers framed it: the VPS builds the image from git, images live only as local
tags (no registry), Marketplace apps keep building from source on the box, and the winners get built. The finding
that ranks first: BuildKit drops cache mounts unused for 48 hours, so round 5's cache mounts helped only deploys a
day or two apart, and any prune made the next deploy cold.

**Brief 117** holds the alternative the owner deferred: verified prebuilt app output, with its digest in
`verified.json`.

**Round 12 reverted.** Brief 114 had measured PTY batching on 2026-11-23 and closed it as measured, not built;
round 12 missed it and shipped a similar rule on unpinned numbers. Measured again under brief 114's conditions (the
backend pinned to one CPU, as the production cap has it), round 12's 5 ms join raised the backend's CPU on a 50 MB
`cat` by 31% and its drain by 4%; on `yes | head -c 50M` it saved 4% CPU and 7% drain. Brief 114's bar wants a 15%
drop in either, so it went back (`992b178`). The numbers are on [research-pty-batching.md](research-pty-batching.md).

## Round 17 (2026-11-24): a deploy builds the slow parts once

**The bar, written before the first build:** ship only if a code-only deploy after `docker builder prune -af` takes
at least 3× less wall time than plain `docker compose build`, needs no Rust toolchain image, and builds an image with
the same files.

**What changed.** The Dockerfile's slow parts are stages of their own, named by global build arguments that default
to the stages (so `docker compose build` still builds everything): `runtime-base` (Alpine's packages, the user, the
shell's files, Nix with its base profile and package index), `wayland-host-bin` (the host's binary alone, on
`scratch`), `deps` and `proddeps-bin` (production's `node_modules` alone). `infrastructure/image.sh` (also
`npm run image`) tags each `imbatranim-<stage>:<hash>`, the hash covering the stage's text, the files it copies and,
recursively, the stages it builds on or copies from (for `manifests`, its normalised output, so a version bump
changes nothing). It builds missing parts side by side, runs compose with the tags, keeps two tags a part and removes
the untagged images earlier builds left. It needs only Docker and a POSIX shell, since the VPS may not have Node.

| A deploy, four cores | `docker compose build` | `image.sh` |
|---|---:|---:|
| Cold | 207 s | 187 s |
| Code only, cache intact | 23 s | 28 s |
| Code only, after the build cache is pruned | 181 s | 28 s, no Rust image |

The bar holds: 6.5× faster, no Rust image, the same 5,422 files (only Nix's database differs, as between any two
builds). The image booted and answered `/health`, the first full prod-stage build in this container, Nix included.
A first version built the parts one after another (310 s cold) and kept the Rust toolchain and the compilers inside
the host's and proddeps' tags (1.19 GB and 675 MB); the side-by-side builds and the `scratch` stages (3.9 MB and
34 MB) fixed both.

**Owner steps:** vps-deploy runs `infrastructure/image.sh` instead of `docker compose build`, never with `--pull`
(a local tag can't be pulled); any prune there takes `--filter label!=imbatranim.base`.

## Round 18 (2026-11-24): Marketplace builds at a lower CPU priority, measured and left

**The bar, written before measuring:** with the backend pinned to one CPU (its children, the build among them,
inherit it, as under the production cap), ship only if during a suite install the API request p95 and the Terminal
echo p95 drop at least 30%, and the install takes no more than 25% longer.

**What was tried.** `runStep` set each Marketplace step's nice value to 10 and its OOM score to 1,000 as it started,
so everything the build forked inherited both. A spec checked both values.

| Six installs of Accessories each (two passes of three) | Same priority | nice 10 | Change |
|---|---:|---:|---:|
| API request p95 during the install, median | 7.6 ms | 5.1 ms | −34% |
| Terminal echo p95 during the install, median | 6.2 ms | 7.4 ms | worse |
| Install time, median | 6.2 s | 6.7 s | +8% |

At idle the API p95 was 4 to 6 ms and the echo's 2 to 5 ms: an install barely touched the desktop at the same
priority, because the kernel's scheduler already favours the mostly idle backend. The echo didn't improve, so the
bar fails: reverted, the OOM score with it (nothing measured it).

## Round 19 (2026-11-24): a service app keeps only what its server runs on

**The bar, written before measuring:** ship only if imbatranim-office's kept build directory shrinks at least 50%
and its server starts and answers `/health` from the pruned tree.

**What it was.** A service app's server runs from its build directory, so round 15's trimming skips it, and the
whole install stays. imbatranim-office (the catalog's one service suite): `npm ci` 23 s and 660 MB at peak,
`npm run build:os` 4.7 s and **1.96 GB** at peak, then 964 MB on disk, 924 MB of it `node_modules` (65,808 files).
`npm prune --omit=dev` keeps the server working but saves only a quarter (692 MB): the heavy packages (Univer
178 MB, Harbour 78 MB, pdf.js, Lucide) are production dependencies of the suite's client apps, already bundled into
the output. Only the server workspace's own dependencies are needed: `npm ci --omit=dev --workspace=server`, 6 s,
leaves 86 MB.

**What changed.** A descriptor's server may name its own install, `server.install` (an argv, like every command
there), run after the build passes its checks; it replaces the build's dependencies, and a failure fails the install
with the live build kept. imbatranim-office's descriptor names `npm ci --omit=dev --workspace=server`. Installed
through the backend from the real catalog: 86 MB and 5,810 files kept, the server started through a lease and
answered `/health`. The e2e test installs a service fixture whose install replaces `node_modules` and one whose
install fails; the whole marketplace e2e passed, the service-app test included.

**Found on the way: Office can't install under the production cap.** In a `node:24.22.1-alpine` container with
1 GiB and no swap, its `npm ci` passes and its `npm run build:os` is OOM-killed (exit 137), with V8's heap capped at
384 or 512 MB, one Rayon thread and one libuv thread too. The memory is the bundler's own. It goes to the owner
with the research ranking (item 3) and brief 117.

## Round 20 (2026-11-24): the dev image after a dependency change

**The bar, written before measuring:** ship only if a rebuild of the dev target after a dependency change takes at
least 30% less wall time, and the dev container starts and answers `/health`.

**What it was.** The dev stage was built on `deps`, so a changed lockfile reran `npm ci` and then Alpine's packages
and Nix's setup on top (the Dockerfile carried a second copy of the Nix block for it).

**What changed.** `dev` builds on `runtime-base` (the production image's packages, user, shell files and Nix), adds
the toolchain and the test apps (foot, gtk3-demo), and copies `deps`' `/app` after everything slow.

| The dev target, the change a new `description` in package.json | Before | After |
|---|---:|---:|
| First build | 157 s | 85 s (runtime-base already built) |
| Rebuild after a dependency change, twice | 85 and 87 s | 50 and 46 s |

The same `node_modules` tree (58,256 files), ownership, tools and user; the container started with the backend's
`/health` and Vite answering.

