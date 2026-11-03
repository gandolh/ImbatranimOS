# Brief 22 — The dev image survives a version bump

## Context

Asked by the owner on 2026-11-03, while the dev image rebuilt to retake the
README images. Every commit in this repo bumps the minor version
(`scripts/bump-version.mjs`, the owner's rule since 2026-10-07). That
rewrites `version` in `package.json` and two fields of `package-lock.json`.
The `deps` stage of `infrastructure/Dockerfile` copies both files before
`RUN npm ci`, so the cache key changes on every commit, and any image build
after a commit:
- reruns the full `npm ci`, including the native addons (node-pty,
  better-sqlite3);
- then, in the `dev` stage, runs `chown -R imbatranim /app`, which walks all
  of `node_modules`.

On 2026-11-03 that build sat on the chown step for minutes. Compose `watch`
(`infrastructure/docker-compose.yml`, `develop.watch`) also has `rebuild`
actions on `package.json` and `package-lock.json`. So during `npm run dev`
every commit rebuilds and restarts the dev container, though no dependency
changed.

## Spec

1. **Make the `npm ci` layer depend on the dependencies, not the version.**
   For example, a small `manifests` stage copies `package.json`,
   `package-lock.json` and the workspace manifests, and writes copies with
   the root `version` fields blanked. `deps` then takes them with `COPY
   --from=manifests`, whose cache key is the normalised content. Check that
   `npm ci` accepts the normalised pair. The real files stay as they are in
   the stages that build or label the image, and the prod image still reports
   the real version (About panel, `IMAGE_VERSION`).
2. **Stop walking `node_modules` in `dev`.**
   - Copy the sources with `COPY --chown=imbatranim:imbatranim`.
   - Give the user only the directories it writes, such as `node_modules/.vite`
     and `.turbo`, or move those caches out of `/app`.
   - Measure that `turbo dev` still starts and Vite can write its cache.
3. **Watch shouldn't rebuild for a version bump.** Find a trigger that fires
   only when dependencies change. Options:
   - watch the normalised manifests, written by a small script;
   - `sync` the manifests and run `npm ci` in the container only when the
     lockfile's dependencies differ.

   Pick the simplest that works with Compose's `develop.watch`, and record
   why.
4. Update `docs/getting-started.md` and `docs/images/shots.md` where they say
   to rebuild the dev image when it is older than the code.

## Must preserve

- The prod image's contents and version label.
- `npm ci`'s strictness: a real dependency change still reinstalls.
- The dev container's user and permissions model (no root at run time).

## Acceptance

- After a commit that only bumps the version, `docker compose -f
  infrastructure/docker-compose.yml --profile dev build dev` reuses the
  `npm ci` layer. Time it before and after, and put both numbers in the
  outcome.
- During `npm run dev`, a version-only commit doesn't restart the container.
  A change to a dependency still does.
- The prod image builds and reports the new version.
- `npm run dev` starts, signs in, and hot-reloads a change to
  `apps/core/src`.

## Files you OWN

`infrastructure/Dockerfile`, `infrastructure/docker-compose.yml`, a helper
script under `scripts/` if needed, `docs/getting-started.md`,
`docs/images/shots.md`, `corpus/wiki/status.md`, `corpus/log.md`.

## Outcome (2026-11-03)

**Built in `6f36e2b` (version 1.117.0).**

1. **The `npm ci` layer keys on the dependencies.** A `manifests` stage
   copies the workspace manifests and runs `scripts/normalise-manifests.mjs`,
   which sets the root `version` in `package.json` and both of the
   lockfile's to `0.0.0`. `deps` copies that output and runs `npm ci`, which
   accepts the pair. `turbo.json` left `deps`: `builder` and `dev` copy it
   with the real `package.json` and lockfile. The prod stages
   (`proddeps`, `prod`) are untouched, so the prod image is as it was;
   `proddeps` still reinstalls on a bump (it owns no normalised copy, and
   its hidden lockfile would record the blank version).
2. **No walk over `node_modules`.** The dev stage copies sources, manifests
   and the catalog with `--chown`, and makes only what the runtime writes,
   found by listing what a running dev container wrote under `/app`:
   `/app/.turbo`, `apps/backend` (Nest's `deleteOutDir` removes and
   recreates `dist`, so the parent has to be writable), and
   `apps/core/node_modules/.vite` and `.vite-temp`. Those layers moved after
   the Nix setup, which a version bump used to rerun too.
3. **Watch.** The first option: `npm run dev` runs `scripts/dev.mjs`, which
   writes version-free copies of `package.json`, the lockfile and the
   Dockerfile to `infrastructure/.dev-deps/` (gitignored), polls the
   originals every second and rewrites a copy only when its content
   changes, then runs `docker compose … --profile dev watch`. Compose
   rebuilds on `.dev-deps` and `turbo.json`. Chosen over syncing the
   manifests and running `npm ci` inside the container, which would need the
   user to own `node_modules` again and would reinstall under running
   servers. Running `watch` by hand skips the script and leaves the copies
   stale; the compose file and the docs say so.
4. `getting-started.md` and the infra README say how a rebuild is decided;
   `shots.md` builds with `up -d --build dev` instead of "build if older
   than the code".

**Measured** in this sandbox (the build injected the session proxy's CA and,
because GitHub archives and one large download are refused there, fetched
the nixpkgs pin from the release snapshot's `nixexprs.tar.xz` and the
package index with curl; nothing in the repo changed for that):
- A version-only bump, then `--target dev`: **4 min 31 s before** (`npm ci`
  90 s, the Nix setup 52 s, `chown -R` 93 s, apk), **4.3 s after** (everything
  slow cached; only the `manifests` stage and the last copies ran).
- The new dev image: turbo, Nest and Vite start as `imbatranim` with no
  permission errors; Vite wrote its dependency cache, Nest its `dist`;
  sign-in works and an edit to `apps/core/src` hot-reloaded with no page
  reload.
- The prod image builds (509 MB) and reports the version in its label,
  `IMAGE_VERSION` and `package.json`; it starts healthy.
- **Watch:** Compose here builds through bake, which refuses the sandbox's
  host networking, so the full image couldn't be rebuilt by Compose. The
  watch rules were run instead on a miniature with this compose file's
  `develop.watch`, the repo's ignore files, `dev.mjs` and the bump script:
  a version-only bump changed three files and no copy, and the container
  was not restarted; a change to turbo's range in `package.json` rewrote
  the copy and Compose rebuilt and recreated the container. The real
  `npm run dev` is for the owner's next run.

**Found:** `watch` with no service named also starts the profile-less prod
service, building it if its image is missing; filed as the todo
`npm-run-dev-also-starts-the-prod-service`, not changed here.
