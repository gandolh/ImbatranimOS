# Brief 117: The Wayland host's Rust build keeps its cache between builds

**Depends on:** nothing. **Runs after:** 116.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

**Builder:** Sonnet.

Filed 2026-11-24 from the estate's infra review. Every app image is built on the box by vps-deploy's `server`
phase, on its 2 vCPUs. On 2026-11-23 the box's build cache reached 9.3 GB and its disk 90%; the cache was pruned
to zero on 2026-11-24, so the next rollout builds every image cold. This repo's node base is already pinned
(`node:24.22.1-alpine`), so the estate's base pin needs nothing here.

## Context

- The `wayland-host` stage of `infrastructure/Dockerfile` (lines 88-96) copies `Cargo.toml`, `Cargo.lock`,
  `build.rs`, `csrc`, `src` and `vendor` in one go, then runs `cargo build --release --locked` with no cache
  mount. Any change under `apps/wayland-host` invalidates that layer, and cargo rebuilds the whole crate graph and
  the libvpx C shim from nothing: on the box at every OS deploy that touches the host, and on the laptop at every
  rebuild of `infrastructure-dev-1` through compose watch.
- The host changes often: 18 commits touched its `src`, `csrc` or `Cargo.toml` between 2026-10-24 and
  2026-11-24.
- No Dockerfile in the estate uses `RUN --mount=type=cache` yet. The box's rootless daemon builds with BuildKit
  (this Dockerfile's `COPY --parents` needs it), and cache mounts are plain BuildKit. A cache mount lives in the
  build cache, so vps-deploy's prunes bound it; the target folder is estimated at 300-600 MB. Build times were not
  measured: the measurement is this brief's.
- Line 1 is `# syntax=docker/dockerfile:1-labs`, a floating frontend image resolved from Docker Hub on every build,
  there only for `COPY --parents`. A floating tag can change under a build or fail it when Hub is unreachable. The
  same pin is filed for atrium and game-engine.

## Decisions

- The `cargo build` runs with two cache mounts, the registry (`/usr/local/cargo/registry`) and the target folder
  (`/src/target`), each with its own `id` naming this repo so no other build shares them, and `sharing=locked`.
- A cache mount isn't part of the layer, so the same `RUN` copies the binary out (for example to
  `/out/imbatranim-wayland-host`), and both `COPY --from=wayland-host` lines (212 and 278) read it from there.
- The syntax line is pinned to an exact frontend version, not dropped: dropping it ties the build to the box
  daemon's built-in frontend, whose version nobody here can read.
- **The bar:** keep the cache mounts only if a rebuild after a one-line change in `src/` is at least 3 times
  faster than a cold build on the laptop. Otherwise leave the stage as it is and record the numbers.

## Files you OWN

- `infrastructure/Dockerfile` (the `wayland-host` stage, the two `COPY --from=wayland-host` lines, line 1)
- `.claude/rules/wayland-host.md`, if its build command should mention the cache
- The closeout: the outcome note, `corpus/log.md`, `corpus/wiki/status.md`

## Files you must NOT touch

- Anything under `apps/wayland-host/`.
- The other stages of the Dockerfile.

## What to do

1. **Find the syntax pin.** Read the Dockerfile frontend's release notes for the first stable version that has
   `COPY --parents` without labs. Pin `# syntax=docker/dockerfile:<that exact version>`; if none has it, pin the
   labs channel to an exact version (`1.<n>-labs`).
2. **Measure today on the laptop.** `docker build --target wayland-host` cold (`--no-cache`), then again after a
   one-line comment change in `apps/wayland-host/src/main.rs` (revert it after). Record both times.
3. Make the change as decided.
4. Measure the same two builds with the cache mounts: the first fills the cache, the second is the rebuild.
   Record the build cache's growth (`docker system df` before and after).
5. The full image builds, the binary runs (`imbatranim-wayland-host --version` or its smallest smoke in the
   rules), and `infrastructure-dev-1` still rebuilds through compose watch and starts a Linux app.

If your session can't build Docker images, make the change, run the checks, and hand back with steps 2, 4 and 5
for the controller.

## Acceptance

- The outcome has the four timings and the cache's size, and says whether the bar was met.
- If kept: the image builds, the binary runs, a Linux app opens in the dev container.
- `npm run check` exits 0; `bash corpus/lint.sh` passes.
- End move `ready_for_deploy`.

## Owner steps

- `node cli.ts imbatranim-os server` from vps-deploy. The first deploy fills the cache; the saving shows from the
  second deploy that touches the host.

## Outcome (2026-11-24)

**The bar was not met, so the stage stays as it is; the syntax line is pinned.** By the time this brief ran, the
`wayland-host` stage already had both cache mounts (the target folder with its own `id`) and copied the binary to
`/out` (round 5 of the performance sweep, merged with PR #5). Measured on the four-core cloud container, not the
laptop, with the build cache pruned before each cold build:

| The `wayland-host` stage | Cold | A one-line change in `src/`, twice | Build cache after |
|---|---:|---:|---:|
| Without the cache mounts | 130.2 s | 132.9 / 132.0 s | 623 MB, then +500 MB per change |
| With them (as on `main`) | 124.5 s | 59.1 / 59.5 s | 623 MB, then 631 / 639 MB |

2.1 times, under the 3 times asked for: the host crate itself (`codegen-units = 1`, thin LTO) takes about a minute
whatever is cached. "Leave the stage as it is" now means with the mounts; they also keep the build cache flat,
where a stage without them adds half a gigabyte for each host change, which bears on the box's full disk. The
registry mount's `id` was not added (it was part of keeping them).

**The syntax pin** (`f6014de`): `# syntax=docker/dockerfile:1.28.0`. A two-line Dockerfile with `COPY --parents`
and `COPY --exclude` built with each stable frontend: 1.19.0 and earlier refuse `--parents`, 1.20.0 is the first
that takes both. 1.28.0 is the newest release at least two weeks old. The full image built with it through
`infrastructure/image.sh` (134 s) and booted; the host binary ran a Firefox window in it.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server`.
