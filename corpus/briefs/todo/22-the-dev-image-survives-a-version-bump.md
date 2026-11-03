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
