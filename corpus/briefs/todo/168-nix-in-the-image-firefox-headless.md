# Brief 168 — Nix in the image; Firefox runs headless

## Context

Settled 2026-10-23 ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md)):
Linux GUI apps run in the container and show as OS windows. The OS stays on
Alpine, and Linux apps come from Nix, installed by the `imbatranim` user at
runtime without sudo. Firefox is the first app.

This brief tests the riskiest assumption before any Wayland host work depends
on it: that a Nix-packaged Firefox runs in this unprivileged Alpine container.
It shows no window. Briefs 169 to 173 build the window layer on top of it.

## Spec

1. **Install Nix in the prod and dev stages.** Check Alpine's `nix` package
   (community repo) first: its version, and whether it works as a non-root
   single-user install on musl. If it is old or broken, use the static `nix`
   binary from the NixOS release instead. Record which you chose and why in the
   outcome.
2. **Run it single-user.** `/nix` is created at build time, owned by
   `imbatranim` (uid 1000), and declared a volume. Add it to
   `docker-compose.yml` as its own named volume (`imbatranim-nix`), for both
   the prod and dev services. It sits outside the home folder, so Settings →
   Backup skips it by construction, the same way installed marketplace builds
   are skipped. Say so in `docs/backup.md`.
3. **Write `nix.conf`** (in the image, root-owned):
   - `sandbox = false`, because the build sandbox needs user namespaces an
     unprivileged container doesn't get;
   - `max-jobs = 0`, so a package with no cached binary fails instead of
     compiling on the machine;
   - `experimental-features = nix-command flakes`;
   - the default `cache.nixos.org` substituter and its key.

   Unfree packages are allowed. Pick one mechanism (user `config.nix`, or
   `NIXPKGS_ALLOW_UNFREE=1` with `--impure`) and document it.
4. **Pin one nixpkgs revision.** The pin is the `nixos-26.05` release, at the
   commit in `https://channels.nixos.org/nixos-26.05/git-revision`. One file
   in the repo (`infrastructure/nix/`) holds the release name and the commit,
   and nothing else repeats them. Register the pin in the user's flake
   registry as `nixpkgs`, so `nix profile install nixpkgs#firefox` installs
   from the pinned commit. Brief 172 searches `packages.json.br` from the same
   release, so it must be able to read this file.
5. **Give Terminal shells what Nix apps need on a host that isn't NixOS.** Set
   these in the PTY's child environment (`childEnv` in
   `apps/backend/src/modules/pty/`) and in the shell profile:
   - `~/.nix-profile/bin` on `PATH`;
   - `XDG_DATA_DIRS` including the profile's `share`;
   - `LOCALE_ARCHIVE` from `glibcLocales` at the pinned commit;
   - fonts: one font package from the pin, with fontconfig pointed at the
     profile's fonts;
   - `XDG_RUNTIME_DIR`: a mode-0700 directory owned by `imbatranim`, created
     by `entrypoint.sh`.

   There is no session D-Bus. Note any GTK warnings this causes; don't fix
   them here.

   **Who installs the fonts and locale data.** `/nix` is a named volume and
   starts empty. `entrypoint.sh` installs a small base profile
   (`imbatranim-base`) on boot when it is missing: one font package and the
   smallest cached UTF-8 locale package at the pin (check `glibcLocalesUtf8`
   first; a custom locale override would need compiling, which `max-jobs = 0`
   forbids). With no network at boot, it logs and carries on; the OS works,
   and Linux apps wait until the next boot. If that turns out to be
   unworkable, fill the volume from the image at build time instead (Docker
   copies image content into a new named volume once) and record why.
6. **Prove it from the Terminal:**
   1. Run `nix profile install nixpkgs#firefox`.
   2. Run `firefox --headless --screenshot ~/shot.png https://example.org`.
   3. Open `shot.png` in the Image Viewer. It must show readable text, so
      fonts and locale work.
   4. Repeat after `docker compose down` and `up` (the volume persists) and
      after an image rebuild.
7. **Measure and record** in the outcome note:
   - the image size before and after;
   - the size of `/nix` after Firefox;
   - how long the install took;
   - peak RAM of the headless screenshot run.

## Must preserve

- `imbatranim` has no sudo, and nothing runs as root after the entrypoint.
  Nix runs as `imbatranim`.
- The image still builds from source with `docker compose build`; Nix
  binaries come from the cache at install or first boot, not at image build
  time (unless Spec 5's fallback is taken and recorded).
- The Terminal, Files, Backup and every other app behave as before. A backup
  archive's contents don't change.

## Acceptance

- The steps in Spec 6 pass in the dev container and in the prod image.
- `npm run typecheck`, `npm run lint`, and the backend tests pass.
- `infrastructure/README.md` has a short "Linux apps and Nix" section: the
  volume, the pin and how to move it, and why there is no build sandbox.
- Outcome note with the numbers from Spec 7, a `status.md` row and a
  `log.md` entry.

## Files you OWN

- `infrastructure/Dockerfile`, `infrastructure/docker-compose.yml`,
  `infrastructure/entrypoint.sh`, `infrastructure/nix/**` (new)
- `infrastructure/README.md`, `docs/backup.md`
- `apps/backend/src/modules/pty/pty.constants.ts` and the `childEnv` helper
  (environment only)

## Files you must NOT touch

- `apps/core/**` and every add-on: no UI in this brief.
- The marketplace backend.
