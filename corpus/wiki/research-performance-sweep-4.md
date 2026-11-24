---
summary: Rounds 16-20 of the performance sweep in full. Round 16 researched and ranked deploys and infrastructure (research-deploy-infrastructure.md), wrote brief 117, and reverted round 12's PTY join after measuring it pinned to one CPU. Round 17 made a deploy build the image's slow parts once, as local tagged bases (infrastructure/image.sh): a code-only deploy after a pruned build cache 181 to 28 s. Round 18 measured Marketplace builds at a lower CPU priority and left it.
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
