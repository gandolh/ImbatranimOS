---
summary: The 2026-11-24 deploy and infrastructure research for ImbatranimOS and imbatranim-apps, ranked. The VPS builds the image from git and keeps images only as local tags (owner, 2026-11-24). BuildKit drops cache mounts unused for 48 hours, so an occasional deploy rebuilt the Rust host, every npm download and the desktop; local base images tagged by content hash survive that. Also ranked: what each deploy leaves on disk, imbatranim-office's build not fitting the 1 GiB cap, service apps' dependencies, the dev image, npm's ever-growing cache, digests, and verified prebuilt app output (brief 117).
updated: 2026-11-24
---

# Deploy and infrastructure, researched and ranked (2026-11-24)

The owner asked (2026-11-24) what deploys and infrastructure could do better for ImbatranimOS and imbatranim-apps:
resource efficiency, cleaner dependencies, smoother pipelines, caching and reusing images, and whether a base image
could spare each deploy its installs. The owner's answers to the questions this research put:

- **The VPS builds from git**: vps-deploy checks the repository out there and builds the image with Docker.
- **No registry**: images live only as local tags on the VPS ("build-from-source distribution", corpus/CLAUDE.md).
- **Marketplace apps keep building from source** on the box; verified prebuilt output is a backlog brief (117).
- **Build the winners** as rounds of the performance sweep, measured.

vps-deploy itself was outside this pass (the owner reviews it next); where its commands matter, the assumption is
named.

## What a deploy does today

`infrastructure/Dockerfile` builds everything a deploy needs from the repository: the workspace manifests with the
version taken out (`manifests`); every dependency with a native toolchain (`deps`, `npm ci` of about 2,000 packages);
the desktop and the backend (`builder`, turbo); the Wayland host (`wayland-host`, `cargo build` on `rust:1.97-alpine`,
a 1.07 GB image); the production `node_modules` (`proddeps`, a second `npm ci` and node-pty's compile); and the
runtime (`prod`: Alpine's packages, the `imbatranim` user, Nix with its base profile and the snapshot's package
index, then the code).

Round 5 made a warm rebuild cheap: the version every commit bumps no longer reaches `npm ci`, and npm's downloads,
turbo's cache and cargo's registry and `target` are BuildKit cache mounts. "Warm" was the catch.

### What BuildKit keeps between deploys

The Docker Engine's builder (BuildKit v0.35 here, Docker 29.10) runs four garbage-collection rules
(`docker buildx inspect default`; Docker's [build garbage collection](https://github.com/docker/docs/blob/main/content/manuals/build/cache/garbage-collection.md)
page gives the same defaults):

| Rule | What it removes | When |
|---|---|---|
| 0 | Cache mounts, local sources, git checkouts | unused for 48 hours, past a small cap (13.8% of the keep budget, at least 512 MB; 3.3 GiB on this 252 GB disk) |
| 1 | Any other build cache | unused for 60 days, past the reserve |
| 2, 3 | Unshared, then any build cache | past the reserve (10% of the disk or 10 GB) |

So cargo's `target` (gigabytes), npm's downloads and turbo's cache survive only deploys less than two days apart.
Layers survive 60 days, but a step whose input changed reruns, and it reruns without its cache mount: a change to the
host after two quiet days compiles smithay, libopus and the rest again; a changed lockfile downloads all 2,000
packages again. And anything that prunes (`docker builder prune`, `docker system prune`, a full disk) makes the next
deploy cold: every install and compile, the 1 GB Rust image included.

Tagged images are not build cache. Neither rule nor `docker builder prune` touches them.

## Measured (2026-11-24)

A copy of the tree built with Docker 29.10 in the cloud container (four cores, overlay2), the full production image
Nix included. The VPS has two vCPUs, so its times are longer; the ratios are what carry over. The copy differed from
the repository only in what this sandbox needs: its proxy and certificate in each stage, the Nix registry pointed at
the pinned snapshot's own `nixexprs.tar.xz` (GitHub's tarballs are refused here) and `curl` for the package index.

| A deploy | `docker compose build` | `infrastructure/image.sh` |
|---|---:|---:|
| Cold: nothing cached, every base built | 207 s | 187 s (the bases build side by side) |
| Code only, build cache intact | 23 s | 28 s (5 s of hashing and cleanup) |
| Code only, after the build cache is pruned | 181 s | 28 s, with the Rust image untagged |

In a cold build the host's `cargo build` took 176 to 197 s, each `npm ci` about 100 s, and Nix's setup 60 to 66 s.
The script's image holds the same 5,422 files in `node_modules`, the host, Nix, `/usr/lib` and the config as plain
compose's (only Nix's database differs, as between any two builds), boots and answers `/health`. Kept on disk:
`runtime-base` 264 MB (172 MB of it the node image every stage shares), `deps` 1.26 GB, `wayland-host-bin` 3.9 MB
and `proddeps-bin` 34 MB; the image itself is 329 MB.

Each build of `imbatranimos:1.0` left the previous one untagged: six builds here left five 329 MB images (shared
layers, but 1.5 GB "reclaimable" by `docker system df`).

## Ranked

1. **Prebuilt local bases** (built in round 17). `infrastructure/image.sh` tags each slow part by the hash of what it
   is made from and reuses it; a version bump changes no hash. Owner step: have vps-deploy run the script instead of
   `docker compose build`, and never with `--pull` (a local tag can't be pulled) or `--no-cache` on the bases.
2. **A deploy cleans up after itself** (in the same script). It keeps two tags of each base and removes the untagged
   images earlier builds left. Owner step: if vps-deploy prunes, `docker image prune -a --filter
   label!=imbatranim.base`; a bare `-a` or `docker system prune -a` removes the bases and makes the next deploy cold.
3. **imbatranim-office can't install under the production cap.** Its build peaks at 1.96 GB resident; in a
   `node:24.22.1-alpine` container with 1 GiB and no swap it is OOM-killed within seconds, with V8's heap capped,
   one Rayon thread and one libuv thread too: the memory is native, in the bundler. The OS can't fix it from
   outside. Two ways out: imbatranim-office's build uses less (one Vite build per app, in turn), or brief 117's
   verified prebuilt output (33 MB for the suite). Owner's call.
4. **A service app keeps only what its server runs on** (built in round 19). A descriptor's `server.install`
   replaces the build's dependencies: imbatranim-office's build directory 964 MB to 86 MB, its server answering.
5. **The dev image after a dependency change** (built in round 20). The dev stage builds on `runtime-base` and
   copies `deps`' tree in last: a rebuild after a dependency change 85 to 48 s.
6. **npm's cache for Marketplace builds** (`~/.imbatranim/apps/.cache/npm`) only grows: npm never removes data
   ([npm cache](https://docs.npmjs.com/cli/v11/commands/npm-cache)); `npm cache verify` garbage-collects what nothing
   references. Measured in a later round.
7. **BuildKit's garbage collection on the VPS.** `builder.gc` in `daemon.json` can keep cache mounts longer; with
   the bases tagged, little depends on it. An owner choice, not a repository change.
8. **Verified prebuilt app output** instead of building on the box: brief 117, at the owner's call to keep source
   builds for now; item 3 is its strongest case.

**Measured and left:**

- **Marketplace builds at a lower priority** (round 18). With the backend and an install sharing one CPU, the
  desktop's API p95 stayed 5 to 13 ms at the same priority; `nice` 10 lowered the API p95 about a third but not the
  Terminal echo's, and made installs 8% longer. The kernel already favours the mostly idle desktop.
- **The build context**: 10.6 MB, sent in 0.3 to 0.4 s. Not worth a rule.
- **Firefox's memory under the cap** (round 24). With its spare content process and hidden new-tab page off, one
  window's PSS fell from 519 to 439 MiB; set through a policy file, which makes Firefox say it is managed. Brief 119.
- **Pinning base images by digest**: steadier cache keys, but each Alpine or Node security rebuild would need a
  commit. With the bases tagged locally, a tag is resolved only when its part rebuilds.
- **A shared clone for the three suites at one imbatranim-apps commit**: each install is about 5 s and 8 MB once
  round 15 trims it.
- **Not proposed**: a registry or CI (the owner's call and the corpus's invariant), a non-Alpine or distroless base
  (Alpine is the product), a second architecture.

## imbatranim-apps

Its apps reach the box through the Marketplace: accessories, developer and games build from one imbatranim-apps
commit, hollow from game-engine, imbatranim-office (a service, with a server) from its own repository. Accessories
measured 2026-11-24: `npm ci --workspace=accessories` 5.7 s and 303 MB at peak, `npm run build:os` 1.8 s and 448 MB
at peak, 144 KB of output. imbatranim-office: `npm ci` 23 s and 660 MB at peak, `npm run build:os` 4.7 s and 1.96 GB
at peak, 33 MB of output, 924 MB of `node_modules` (65,808 files). Its own pipeline (`npm run check`) already mirrors this repository's.
