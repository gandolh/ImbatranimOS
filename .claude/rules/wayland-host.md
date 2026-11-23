---
paths:
  - "apps/wayland-host/**"
---

# The Wayland host (`apps/wayland-host`, Rust)

- Read [PROTOCOL.md](../../apps/wayland-host/PROTOCOL.md) and
  [status-linux-apps-layer.md](../../corpus/wiki/status-linux-apps-layer.md) before you change it; the calls are in
  [decisions-linux-apps.md](../../corpus/wiki/decisions-linux-apps.md) and the two pages after it.
- **Build and test in the builder image**, the Dockerfile's `wayland-host` stage (`rust:1.97-alpine`, musl), not a
  laptop's toolchain: from the repo root,
  `docker run --rm -v "$PWD/apps/wayland-host:/src" -w /src -e RUSTFLAGS="-C target-feature=-crt-static" rust:1.97-alpine sh -c 'apk add --no-cache musl-dev libxkbcommon-dev pkgconf cmake make libvpx-dev && cargo test --locked'`.
  One test file: `cargo test --locked --test <name>`; the end-to-end tests in `tests/` drive the built binary with
  a hand-written Wayland client. `npm run check` doesn't touch the host.
- **The dev container is `infrastructure-dev-1`**, reused, never a second one: a change under `apps/wayland-host`
  rebuilds its image through compose watch (`infrastructure/docker-compose.yml`), and the backend starts the host
  from `WAYLAND_HOST_BIN`.
- **Priorities, in this order, when two pull apart** (the order is brief 112's; each line has its source):
  1. The owner's typing and pointer reach the app without waiting on the link
     ([research-native-apps-via-wayland.md](../../corpus/wiki/research-native-apps-via-wayland.md), §2).
  2. Text and UI stay lossless; only video regions go lossy
     ([brief 36](../../corpus/briefs/done/36-video-regions-go-lossy-and-text-stays-sharp.md)).
  3. Host CPU stays under one CPU, production's cap
     ([how-we-measure.md](../../corpus/wiki/how-we-measure.md), rule 7).
  4. Bytes on the link ([research-video-in-linux-windows.md](../../corpus/wiki/research-video-in-linux-windows.md)).
- **The protocol changes in one commit, four places**: `PROTOCOL.md`, `src/protocol.rs`, the backend's
  `apps/backend/src/modules/wayland/wayland.protocol.ts` and `protocol-fixtures/` (`UPDATE_FIXTURES=1 cargo test
  fixtures_match` rewrites them; the backend's spec decodes the same bytes). Bump `hello`'s version only when an
  older tab would misbehave.
- **Measure before a performance change**: brief 101's recipe in
  [how-we-measure.md](../../corpus/wiki/how-we-measure.md) and `scripts/bench/`; the pass bar is written first, and
  "measured, not built" is a valid end.
- **Only the owner raises windows.** A request from an app (activation, urgency) marks the taskbar, never focuses.
- `vendor/smithay/` is smithay 0.7.0 with one patch; change it only with its [README](../../apps/wayland-host/vendor/README.md).
- Traps already paid for: `pkill -f <pattern>` matches the shell that runs it, which carries the pattern in its
  own command line, so it kills the caller (brief 112); a window zoom beside a Linux window crashed Chromium's
  renderer, so there is none ([decisions-linux-apps-built.md](../../corpus/wiki/decisions-linux-apps-built.md),
  "No zoom while a Linux window is open"); a Unix socket's path must fit in about 108 bytes, so keep
  `XDG_RUNTIME_DIR` short.
