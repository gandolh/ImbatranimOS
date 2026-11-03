# Brief 01 — Nix in the image; Firefox runs headless

## Context

Settled 2026-10-23 ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md)):
Linux GUI apps run in the container and show as OS windows. The OS stays on
Alpine, and Linux apps come from Nix, installed by the `imbatranim` user at
runtime without sudo. Firefox is the first app.

This brief tests the riskiest assumption before any Wayland host work depends
on it: that a Nix-packaged Firefox runs in this unprivileged Alpine container.
It shows no window. Briefs 02 to 06 build the window layer on top of it.

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
   in the repo (`infrastructure/nix/`) holds the release name, the release
   snapshot's directory on `releases.nixos.org` (added 2026-11-03) and the
   commit, and nothing else repeats them. Register the pin in the user's flake
   registry as `nixpkgs`, so `nix profile install nixpkgs#firefox` installs
   from the pinned commit. Brief 05 searches `packages.json.br` from the same
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

   **Who installs the fonts and locale data** (revised by the owner
   2026-11-03, [decisions-linux-apps.md](../../wiki/decisions-linux-apps.md)).
   The image build installs a small base profile (`imbatranim-base`) into
   the image's `/nix`: one font package and the smallest cached UTF-8 locale
   package at the pin (check `glibcLocalesUtf8` first; a custom locale
   override would need compiling, which `max-jobs = 0` forbids). Docker
   copies it into a new Nix volume, so the first boot needs no network. Boot
   never downloads: a volume without the base logs it and carries on.

   **The package index** (same revision). The build also bakes the pinned
   snapshot's `packages.json.br` and `git-revision` into the image, from the
   snapshot directory the pin names on `releases.nixos.org`, and checks the
   revision against the commit. Brief 05 searches it.
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
- The image still builds from source with `docker compose build`. The base
  profile's binaries come from the cache at image build (2026-11-03); apps'
  come from it when the user installs them.
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

## Status (2026-11-02): built, the in-container proof is owed

Built on `claude/linux-apps-layer` in `c5ef3b2`. It stays in `todo/` because
the environment it was built in could not prove it in a container: its
Docker daemon starts but can't pull `node:24.22.1-alpine` (Docker Hub is
blocked there), and `cache.nixos.org` and `channels.nixos.org` are blocked
too. Spec 6 and Spec 7 are the owner's to run (commands below).

What was built:

- **Nix: Alpine's package**, `nix` 2.31.5 from the 3.24 community repo (the
  Alpine under `node:24.22.1-alpine`, read from the `aports` branch). It is
  current, signed by apk and needs no second download path, so the static
  binary wasn't needed. It is packaged for a multi-user daemon:
  `setup-image.sh` drops its `/etc/profile.d/nix-remote.sh` (which sets
  `NIX_REMOTE=daemon`) and replaces its `nix.conf`. Whether it runs
  single-user on musl is the first thing the owner's run shows.
- **Single-user, all state in `/nix`.** `/nix` is owned by `imbatranim` and
  declared a volume, `imbatranim-nix` for prod and `imbatranim-nix-dev` for
  dev. One change from the spec: the profile is not `~/.nix-profile`.
  `NIX_STATE_HOME`, `NIX_CACHE_HOME`, `NIX_CONFIG_HOME` and `NIX_DATA_HOME`
  point into `/nix/var/imbatranim` and `use-xdg-base-directories = true`, so
  the profile link is `/nix/var/imbatranim/state/profile` and nothing lands
  in the home. The reason: a home link into `/nix` goes into every backup,
  and restore refuses links that point outside the home, so every backup
  would stop restoring. `~/.cache/nix` (the nixpkgs tarball cache) and the
  font cache stay out of backups the same way.
- **`nix.conf`** as specced, plus `build-users-group =` (single-user) and
  `flake-registry =` (no global registry to download).
- **Unfree:** `NIXPKGS_ALLOW_UNFREE=1` in the image, used with `--impure`. A
  user `config.nix` isn't read by a pure flake evaluation, so it wasn't an
  option for `nixpkgs#…`.
- **The pin:** `infrastructure/nix/nixpkgs-pin.env`, `nixos-26.05` at
  `9bb52223f4f6a0cc606fd0852d8784f896c137d5`. That commit came from the
  `nixos-26.05` branch on GitHub, which the channel advances to the same
  commit, because `channels.nixos.org` was blocked; the owner's run checks it
  against `git-revision`. The image build writes it into the **system**
  registry (`/etc/nix/registry.json`), not the user's: it is image-owned,
  moves with a rebuild, and keeps the home free of a `registry.json`. Brief 05
  reads the pin from `/etc/nix/nixpkgs-pin.env`.
- **Base profile:** `imbatranim-base` holds `dejavu_fonts` and
  `glibcLocalesUtf8` (both top-level attributes at the pin, so Hydra builds
  them; whether they are cached wasn't checkable). First built as a
  background install at boot (`c5ef3b2`); on 2026-11-03 the owner moved it
  into the image build (`383beba`), followed by `nix store gc` to drop the
  nixpkgs source, and removed the boot download. Checked here: the gc keeps
  the profile and collects an unrooted path.
- **Package index** (2026-11-03): `packages.json.br` and `git-revision` from
  the pinned snapshot, baked into `/usr/share/imbatranim/nix/`. The pin file
  gained `NIXPKGS_SNAPSHOT`, which is empty: the snapshot name couldn't be
  looked up from here, and the build stops with instructions until the owner
  fills it in.
- **Terminal environment:** `LOCALE_ARCHIVE`, `FONTCONFIG_FILE` (a
  `fonts.conf` generated at build that lists the base and user profiles'
  fonts and keeps its cache in `/nix`), `XDG_DATA_DIRS` and `XDG_RUNTIME_DIR`
  come from the image's environment; `terminalEnv` in `pty.constants.ts`
  puts the profile first on the shell's `PATH`, and
  `/etc/profile.d/nix-apps.sh` does the same for login shells. The
  backend's own `PATH` leaves the profile out. `XDG_RUNTIME_DIR` is
  `/run/user/1000`, made by the image (the entrypoint runs as `imbatranim`
  and can't create anything under `/run`) and kept at 0700 by the
  entrypoint.

What was proven here, outside a container, with the Nix 2.34.6 this
machine has, against an overlay of its store in a private mount namespace:
`setup-image.sh` runs (with `apk` stubbed); `nix config show` reads the
config as written; `nix registry list` resolves `nixpkgs` to the pin;
`nix profile add` works with `max-jobs = 0` and builds the profile at
`/nix/var/imbatranim/state/profile`; `nix store gc` keeps it; `fc-list` with the generated
`fonts.conf` finds fonts in both profiles and caches in `/nix`; the home
folder is unchanged afterwards. `npm run typecheck`
(26 packages), `npm run lint` (26), the backend's unit tests (808 in 46
suites, 3 new) and its e2e suite (184 in 16) pass.

Not proven: anything in the Alpine image (the build itself, Nix on musl,
Firefox, the screenshot), and no numbers for Spec 7.

### The owner's run

First fill in `NIXPKGS_SNAPSHOT` in `infrastructure/nix/nixpkgs-pin.env`:
open `https://channels.nixos.org/nixos-26.05`, which redirects to
`https://releases.nixos.org/nixos/26.05/<snapshot>/`, and copy `<snapshot>`.
If that snapshot's `git-revision` isn't `9bb52223…`, move `NIXPKGS_COMMIT` to
it too. Then, from the repo root on this branch:

```bash
docker images imbatranimos:1.0 --format '{{.Size}}'      # size before, on main's image
docker compose -f infrastructure/docker-compose.yml build imbatranimos
docker images imbatranimos:1.0 --format '{{.Size}}'      # size after
docker compose -f infrastructure/docker-compose.yml up -d imbatranimos
docker compose -f infrastructure/docker-compose.yml logs imbatranimos | grep -i 'base profile'   # expect nothing
docker compose -f infrastructure/docker-compose.yml exec imbatranimos sh -c \
  'cat /etc/nix/nixpkgs-pin.env; nix registry list; ls -l $NIX_STATE_HOME/profiles'
```

Then, in the desktop's Terminal:

```sh
time nix profile add nixpkgs#firefox
time -v firefox --headless --screenshot ~/shot.png https://example.org 2>&1 | grep -i 'maximum resident'
du -sh /nix
```

Open `~/shot.png` in the Image Viewer: the text must be readable. Then
`docker compose -f infrastructure/docker-compose.yml down`, `up -d` again and
rerun the `firefox` line; then rebuild the image (`build`, `up -d`) and rerun
it once more. `time` is busybox's: its first line is the install time, and
`-v` adds the peak resident set size. If this busybox has no `-v`, read peak
RAM from System Monitor during the screenshot. The dev container is the same
with `--profile dev` and the `dev` service.

## Outcome (2026-11-03): proven in the prod image and the dev container

The owner's run, done in a cloud session whose Docker daemon could build
(`a1ddefe`, version 1.78.0). Spec 6 passes in both containers, from the
desktop's own Terminal in headless Chromium: `nix profile add
nixpkgs#firefox` installs, `firefox --headless --screenshot` writes a
readable `~/shot.png`, the Image Viewer opens it from Files, and the same
line works again after `down` and `up` and after an image rebuild (the
picture byte-identical each time).

**The pin.** `https://channels.nixos.org/nixos-26.05` pointed at
`nixos-26.05.13446.7dcdd87373d7`, whose `git-revision` is `7dcdd873…`, not
the `9bb52223…` taken from GitHub on 2026-11-02, so the commit moved too.

**Nix on musl works single-user**: Alpine's 2.31.5, as built. The base
profile came from the cache at image build (DejaVu and
`glibc-locales-2.42-103`, 4.5 MiB download), and a new volume got it from
the image: no "base profile" warning at boot.

**One fix the proof showed.** `nix store gc` kept 1,828 `.drv` files, the
base profile's whole derivation closure, because Nix's `keep-derivations`
defaults to true. Nothing is built here, so `nix.conf` now sets it false:
the image's `/nix` went from 24 MB to 15 MB and 4 store paths. Installs on
an existing volume keep the derivations they made before.

| | prod | dev |
|---|---|---|
| Image, `main` (`docker images`) | 393 MB (89.2 MB compressed) | 4.72 GB (913 MB) |
| Image, this branch | 488 MB (119 MB) | 4.93 GB (971 MB) |
| Growth | +95 MB (+30 MB compressed) | +210 MB (+58 MB) |
| Firefox install, `time` | 1 m 29 s | 57 s |
| `/nix` after Firefox | 2.1 GB | 2.1 GB |
| Screenshot run, peak RSS | 235 MB first, 208 to 210 MB after | 221 MB |

- The image's files grow 290 to 337 MB (+47 MB, `du -sx /`); Docker's
  figure also counts files rewritten across layers. By layer: Nix's
  (Alpine's `nix` and 25 libraries, the base profile, the 9.4 MB package
  index) 57 MB, `libxkbcommon` with `xkeyboard-config` 5.9 MB, the Wayland
  host 1.9 MB.
- Firefox 159.0 is 322 paths, a 445.9 MiB download unpacking to
  1,402.8 MiB; the largest are Firefox itself (386 MB), python3 (135 MB),
  systemd (63 MB), perl (61 MB) and onnxruntime (51 MB). The decisions
  page's "about 300 MB" for Firefox was low. The other 470 MB of `/nix` is
  the pinned nixpkgs source, unrooted, which a garbage collection removes.
- Peak RSS is busybox `time -v`'s: the largest single process (Firefox's
  parent), not the sum of its content processes.
- A screenshot run takes 3.5 s the first time and under 1 s after.

**Seen, not fixed:**

- The page's Chinese line is boxes: DejaVu has no CJK glyphs. A CJK font
  in the base profile is the owner's call (Noto CJK is tens of MB).
- Firefox logs `Sandbox: CanCreateUserNamespace() clone() failure: EPERM`
  and runs with its sandbox's namespace layer off, as expected in an
  unprivileged container. It is the same limit as Nix's build sandbox.
- One run in fourteen (the first after the image rebuild) exited with
  status 11 after writing the screenshot, with GDK's "Error reading events
  from display: Broken pipe". Headless Firefox never opens the display in
  its parent process (`WAYLAND_DEBUG=1` shows no traffic), and thirteen
  further runs, one in a freshly created container, exited 0.
- Firefox keeps its profile in `~/.config/mozilla` and `~/.cache/mozilla`
  (12 MB after these runs): the app's own data, so it is in backups.
  Nothing of Nix's is in the home.

**How this session differed from the owner's machine** (none of it is in
the repo): Docker Hub rate-limited the session, so base images came through
`mirror.gcr.io`; builds and containers ran on the host network through the
session's HTTPS proxy, whose CA was bind-mounted over the system bundle for
each build step and for the containers, never written into an image.
GitHub's tarball downloads were blocked while git reads weren't, so the
pinned commit's tree came by `git fetch` and reached Nix through a user
registry entry (`path:`), at build and in the containers; the image's own
system registry entry (`github:`) is unchanged and so untested end to end
here. busybox `wget` can't tunnel HTTPS through that proxy, so the
snapshot's `git-revision` and `packages.json.br` were fetched on the host
from the same URLs and handed to `setup-image.sh` by a stand-in `wget`; its
check against the pin ran as written. Firefox got a policy trusting the
proxy's CA. On the owner's machine, with direct network access, none of
this applies, and the install's time there includes the nixpkgs source
download (about 40 MB) that this one didn't.

Checks: `npm run typecheck` (26 tasks) and `npm run lint` (25), the
backend's unit tests (828 in 50 suites) and e2e suite (184).
