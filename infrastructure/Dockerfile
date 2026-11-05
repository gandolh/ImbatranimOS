# syntax=docker/dockerfile:1-labs
# ImbatranimOS — one dual-mode image. Build context is the REPO ROOT
# (npm workspace: one root lockfile covers apps/backend, apps/core and the
# apps/add-ons/* packages).
#
#   prod (default):  slim, Nest serves the built desktop + API on one port
#   dev:             Nest (watch) + Vite (HMR) via `turbo dev`, two ports
#
# Native modules (better-sqlite3, node-pty) are compiled in stages that
# carry build tools; the final prod image copies the built node_modules and
# ships without a compiler.

# ---------------------------------------------------------------------------
# manifests — the workspace manifests with the product version taken out
# ---------------------------------------------------------------------------
# Every commit bumps the version in package.json and package-lock.json
# (scripts/bump-version.mjs). Copied straight into `deps`, they changed the
# `npm ci` layer's cache key on every commit, so each build reinstalled every
# dependency and recompiled the native addons. This stage reruns on every
# commit, but it only copies files and runs one small script, and its output
# changes only when a dependency does: `deps` copies that output, and BuildKit
# keys the copy on its content. The real files return in the stages that build
# the code (builder, dev); the prod image takes its own (proddeps, and the
# package.json it serves the version from).
FROM node:24.22.1-alpine AS manifests
WORKDIR /m
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/core/package.json ./apps/core/
# ALL add-on manifests (--parents preserves each add-on's dir), so `npm ci`
# links every workspace core/src/manifest.ts imports. Globbed so newly-added
# add-ons are picked up automatically — no per-add-on COPY line to keep in sync.
COPY --parents apps/add-ons/*/package.json ./
# Shared workspace packages (e.g. @imbatranim/ui, the kit every add-on and
# core's manifest pull in). Without these manifests npm ci never links the
# packages/* workspaces and the desktop's turbo build fails on the dangling dep.
COPY --parents packages/*/package.json ./
# apps/docs (the documentation site) is DELIBERATELY absent: .dockerignore
# excludes it from the whole build context. npm ci tolerates the missing
# workspace dir, and the builder's `turbo build` must never discover it — its
# Astro deps are not installed here, so copying its manifest in with `COPY
# apps ./apps` would break the image build (it did, silently, from the day the
# site landed until the containerized dev pipeline work simulated a fresh-clone install).
COPY scripts/normalise-manifests.mjs /tmp/
RUN node /tmp/normalise-manifests.mjs /m

# ---------------------------------------------------------------------------
# deps — full workspace install (dev + prod), with native build toolchain
# ---------------------------------------------------------------------------
FROM node:24.22.1-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
# The normalised manifests (above): one root lockfile, one npm ci, reused
# until a dependency changes.
COPY --from=manifests /m/ ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder — compile backend (nest) and the desktop (core vite build, which
# bundles the add-on packages via workspace resolution)
# ---------------------------------------------------------------------------
FROM deps AS builder
# The real manifests over the normalised ones, and turbo's config.
COPY package.json package-lock.json turbo.json ./
COPY apps ./apps
COPY packages ./packages
# Sub-path build args. Default to root / same-origin (the standalone container
# reached at its own port). A Caddy sub-path deploy passes
# VITE_BASE=/imbatranim-os/ + VITE_API_URL=/imbatranim-os/api so the desktop's
# assets, REST (axios), and pty WebSocket all resolve under the prefix; Caddy's
# handle_path strips it back to the container's native / and /api. The backend
# ignores VITE_* — it serves whatever static files the build emitted.
ARG VITE_BASE=/
ARG VITE_API_URL=/api
RUN VITE_BASE=$VITE_BASE VITE_API_URL=$VITE_API_URL npx turbo build

# ---------------------------------------------------------------------------
# wayland-host — the Wayland host Linux apps connect to (Rust, smithay).
# Built in its own stage; only the binary reaches the prod and dev images.
# libxkbcommon is linked dynamically, so musl's static default is turned off
# and the runtime stages install the library instead.
# ---------------------------------------------------------------------------
FROM rust:1.97-alpine AS wayland-host
RUN apk add --no-cache musl-dev libxkbcommon-dev pkgconf
WORKDIR /src
COPY apps/wayland-host/Cargo.toml apps/wayland-host/Cargo.lock ./
COPY apps/wayland-host/src ./src
ENV RUSTFLAGS="-C target-feature=-crt-static"
RUN cargo build --release --locked

# ---------------------------------------------------------------------------
# proddeps — production-only node_modules (native modules compiled here)
# ---------------------------------------------------------------------------
FROM node:24.22.1-alpine AS proddeps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/core/package.json ./apps/core/
# All add-on manifests (see the deps stage) so the workspace tree resolves.
COPY --parents apps/add-ons/*/package.json ./
# Shared workspace packages' manifests too (see the deps stage rationale).
COPY --parents packages/*/package.json ./
# Backend runtime deps only — the desktop is prebuilt to static files, so
# none of its packages (react etc.) may reach the prod image.
RUN npm ci --omit=dev --workspace=backend
# Strip native build intermediates now that the .node binaries are compiled:
# object files, gyp obj.target dirs, and the C sources for node-pty +
# better-sqlite3 (~60MB). Hoisting puts everything in /app/node_modules.
# Each native module's build/ keeps only the binary the runtime loads:
# better-sqlite3's prebuilt download leaves just that, but its source build
# (prebuild-install failing, as under heavy load) also leaves the generated
# sqlite sources, sqlite3.a, test_extension.node, .deps and makefiles, ~13MB
# that grew the image with no change of its own. node-pty has no Linux
# prebuilds, so it always compiles and always left its makefiles. A build/
# without its binary fails the build here rather than at run time.
# Also drop:
#   - typescript: backend's devDep leaks in via the workspace tree (~23MB) even
#     with --omit=dev; the runtime never needs the compiler. rm -rf is a no-op
#     when it is absent, so this is self-guarding.
#   - foreign-arch node-pty prebuilds (win32-*, darwin-*): ~58MB of dead weight
#     on Linux/musl. Keep only linux-x64 (the musl build lives there too). This
#     mirrors iso/scripts/build-payload.sh so both pipelines strip identically.
RUN cd node_modules \
 && find . -name '*.o' -delete \
 && find . -type d -name obj.target -prune -exec rm -rf {} + \
 && rm -rf better-sqlite3/deps better-sqlite3/src node-pty/src node-pty/deps \
 && for keep in better-sqlite3/build/Release/better_sqlite3.node node-pty/build/Release/pty.node; do \
      build="${keep%%/Release/*}"; \
      [ -d "$build" ] || continue; \
      mv "$keep" /tmp/keep.node && rm -rf "$build" && mkdir -p "$(dirname "$keep")" \
        && mv /tmp/keep.node "$keep" || exit 1; \
    done \
 && rm -rf typescript \
 && find . -type d -name prebuilds | while read -r pb; do \
      for d in "$pb"/*; do \
        case "$(basename "$d")" in \
          linux-x64|linux-x64-musl) : ;; \
          *) rm -rf "$d" ;; \
        esac; \
      done; \
    done \
 && mkdir -p /app/apps/backend/node_modules

# ---------------------------------------------------------------------------
# prod — slim runtime: no compiler, runs as the unprivileged imbatranim user
# ---------------------------------------------------------------------------
FROM node:24.22.1-alpine AS prod
LABEL org.opencontainers.image.title="ImbatranimOS" \
      org.opencontainers.image.version="1.146.0"
# git is a RUNTIME dependency, not a build one: the Git app's backend spawns
# `git` (modules/git/git.service.ts). node:alpine does not ship it, and this
# stage previously installed nothing, so the Git app failed on every operation
# in the shipped image while working in development on a glibc host.
# libxkbcommon: the Wayland host links it for the keymap it sends Linux apps.
# tini: PID 1 (below), so the processes an app leaves behind when its parent
# dies are reaped instead of piling up as zombies under node.
RUN apk add --no-cache git libxkbcommon tini
RUN deluser node 2>/dev/null || true; delgroup node 2>/dev/null || true; \
    addgroup -g 1000 imbatranim && adduser -D -u 1000 -G imbatranim imbatranim
# Linux apps come from Nix, run single-user as imbatranim. Every piece of Nix
# state lives in /nix (its own volume), never in the home folder: a home link
# into /nix would make every backup fail its restore, which refuses links that
# point outside the home. The paths are read by setup-image.sh, the
# entrypoint, the Terminal and Nix itself. The dev stage repeats this block.
ENV NIX_STATE_HOME=/nix/var/imbatranim/state \
    NIX_CACHE_HOME=/nix/var/imbatranim/cache \
    NIX_CONFIG_HOME=/nix/var/imbatranim/config \
    NIX_DATA_HOME=/nix/var/imbatranim/data \
    XDG_RUNTIME_DIR=/run/user/1000 \
    FONTCONFIG_FILE=/etc/fonts/nix-apps.conf \
    NIXPKGS_ALLOW_UNFREE=1
ENV LOCALE_ARCHIVE=$NIX_STATE_HOME/profiles/imbatranim-base/lib/locale/locale-archive \
    XDG_DATA_DIRS=$NIX_STATE_HOME/profile/share:$NIX_STATE_HOME/profiles/imbatranim-base/share:/usr/local/share:/usr/share
COPY infrastructure/nix /tmp/nix-setup
RUN sh /tmp/nix-setup/setup-image.sh && rm -rf /tmp/nix-setup
WORKDIR /app
# Hoisted runtime deps + any backend-nested overrides (may be empty).
# --chown sets ownership as the files land, so there is no second `chown -R`
# pass rewriting the whole ~250MB payload into a fresh layer. /app is read-only
# application code at runtime, so it does not strictly need the runtime user's
# ownership — but writing it as imbatranim here is free (single layer) and keeps
# the tree tidy.
COPY --chown=imbatranim:imbatranim --from=proddeps /app/node_modules ./node_modules
COPY --chown=imbatranim:imbatranim --from=proddeps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --chown=imbatranim:imbatranim --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --chown=imbatranim:imbatranim --from=builder /app/apps/core/dist ./public
COPY --from=wayland-host /src/target/release/imbatranim-wayland-host /usr/local/bin/imbatranim-wayland-host
COPY --chown=imbatranim:imbatranim package.json ./
COPY --chown=imbatranim:imbatranim apps/backend/package.json ./apps/backend/
# The marketplace catalog: what may be installed. Root-owned on
# purpose, like the rest of the image's code: the app reads it, never writes it.
COPY marketplace ./marketplace
COPY infrastructure/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh \
 && mkdir -p /home/imbatranim \
 && chown -R imbatranim:imbatranim /home/imbatranim
USER imbatranim
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_ROOT=/app/public \
    FRONTEND_URL=http://localhost:8080 \
    DB_PATH=/home/imbatranim/.imbatranim/db.sqlite \
    NOTES_DIR=/home/imbatranim/notes \
    CONFIGS_DIR=/home/imbatranim/.imbatranim/configs \
    MARKETPLACE_DIR=/app/marketplace \
    IMAGE_VERSION=1.146.0
VOLUME /home/imbatranim
# Nix's store and profiles: Linux apps the user installs survive image
# rebuilds, and Settings → Backup never sees them (they are not in the home).
VOLUME /nix
EXPOSE 8080
# Liveness against the backend's purpose-built /health endpoint. busybox wget
# ships in node:alpine, so no extra package is needed. --start-period covers
# first-boot init (entrypoint mkdir + Nest listen); a non-2xx or connect
# failure makes wget exit non-zero and marks the container unhealthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
# tini is PID 1: it reaps orphans (a Linux app started from a Terminal
# outlives the shell that would have waited for it) and passes signals on.
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["node", "apps/backend/dist/main"]

# ---------------------------------------------------------------------------
# dev — contained development: `turbo dev` = Nest watch + Vite HMR
# (docker compose dev profile SYNCS source changes into this image's own FS
# via `develop.watch` — no bind mounts, no anonymous-volume list)
# ---------------------------------------------------------------------------
FROM deps AS dev
# git, as in the prod stage: the Git app runs it, and so does a marketplace
# install. The deps stage has only the native-addon toolchain. libxkbcommon
# for the Wayland host. foot (with a font) and gtk3-demo are Linux apps to
# test the host with, in the dev image only: foot asks for the OS title bar,
# gtk3-demo draws its own.
RUN apk add --no-cache git libxkbcommon tini foot font-dejavu gtk+3.0-demo
RUN deluser node 2>/dev/null || true; delgroup node 2>/dev/null || true; \
    addgroup -g 1000 imbatranim && adduser -D -u 1000 -G imbatranim imbatranim
# Linux apps under Nix, as in the prod stage (the reasons are there).
ENV NIX_STATE_HOME=/nix/var/imbatranim/state \
    NIX_CACHE_HOME=/nix/var/imbatranim/cache \
    NIX_CONFIG_HOME=/nix/var/imbatranim/config \
    NIX_DATA_HOME=/nix/var/imbatranim/data \
    XDG_RUNTIME_DIR=/run/user/1000 \
    FONTCONFIG_FILE=/etc/fonts/nix-apps.conf \
    NIXPKGS_ALLOW_UNFREE=1
ENV LOCALE_ARCHIVE=$NIX_STATE_HOME/profiles/imbatranim-base/lib/locale/locale-archive \
    XDG_DATA_DIRS=$NIX_STATE_HOME/profile/share:$NIX_STATE_HOME/profiles/imbatranim-base/share:/usr/local/share:/usr/share
COPY infrastructure/nix /tmp/nix-setup
RUN sh /tmp/nix-setup/setup-image.sh && rm -rf /tmp/nix-setup
WORKDIR /app
COPY --from=wayland-host /src/target/release/imbatranim-wayland-host /usr/local/bin/imbatranim-wayland-host
COPY infrastructure/entrypoint.sh /entrypoint.sh
# The runtime writes four places under /app, and gets only those, made here:
# turbo's cache (.turbo), Nest's output (dist, which it deletes and recreates,
# so its parent apps/backend), and Vite's dependency and config caches. The
# rest of /app, node_modules above all, stays root's. It was one
# `chown -R imbatranim /app`, which rewrote all of node_modules into a new
# layer on every build and sat on that step for minutes.
RUN chmod 0755 /entrypoint.sh \
 && install -d -o imbatranim -g imbatranim /home/imbatranim /app/.turbo \
      /app/apps/core/node_modules/.vite /app/apps/core/node_modules/.vite-temp \
 && chown imbatranim:imbatranim /app/apps/backend
# The real manifests over the normalised ones (see the manifests stage), and
# the sources, owned by the user as they land. These change with every commit,
# so they come after everything slow.
COPY --chown=imbatranim:imbatranim package.json package-lock.json turbo.json ./
COPY --chown=imbatranim:imbatranim apps ./apps
# The shared workspace packages are SOURCE the dev server compiles (the
# @imbatranim/ui SDK lives here since the system-handle seam) — without them `turbo dev`
# fails on every dangling workspace dep. The old bind-mount dev flow never
# mounted them either, which is how host edits to packages/* silently did
# nothing in the container.
COPY --chown=imbatranim:imbatranim packages ./packages
COPY --chown=imbatranim:imbatranim marketplace ./marketplace
USER imbatranim
ENV PORT=3001 \
    FRONTEND_URL=http://localhost:5173 \
    DB_PATH=/home/imbatranim/.imbatranim/db.sqlite \
    NOTES_DIR=/home/imbatranim/notes \
    CONFIGS_DIR=/home/imbatranim/.imbatranim/configs \
    MARKETPLACE_DIR=/app/marketplace
EXPOSE 3001 5173
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["npx", "turbo", "dev"]
