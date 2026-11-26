---
summary: Research (2026-11-26) on the owner's question whether imbatranimOS should use mise instead of Nix. The OS never ran NixOS; it runs Alpine with the Nix package manager, single-user on the /nix volume, for Linux apps. Verdict, no. mise installs developer runtimes and command-line tools against the host's libc; its registry has no Firefox, Chromium, LibreOffice or GIMP, its conda backend's Firefox is Mozilla's glibc tarball with no libraries beside it, so nothing it installs could draw a window on musl Alpine. It has no generations or rollback, so Settings → Updates' Go back has nothing to stand on, and on Alpine it compiles Node and Python from source by default until mise 2027.8.0. Not worth adding for the repo's own toolchains either, which the Docker images pin. A user who wants mise in the Terminal can install it from nixpkgs (2026.5.12 at the pin) today. Docs read, not run: running mise was blocked in this session.
updated: 2026-11-26
---

# Research: mise instead of Nix? (2026-11-26)

The owner asked on 2026-11-26: "Can you research if we should use mise instead
of nixos for imbatranimOS?" The OS doesn't run NixOS, and never has. It runs
Alpine, and the Nix *package manager* runs inside it, single-user as
`imbatranim` on its own `/nix` volume, to install [Linux apps](glossary-linux-apps.md)
at runtime without sudo ([decisions-linux-apps.md](decisions-linux-apps.md),
2026-10-23). So the question read here is whether mise could do Nix's job, or
some other job in the repo. This page holds research only. Nothing was built
or added.

**Verdict: no.** mise and Nix answer different questions. mise picks which
version of a developer tool a project uses. Nix here delivers whole GUI
programs, with their own glibc and libraries, onto a musl host that has none
of them, and keeps the last pin to go back to. mise can't install Firefox in a
form that would start on Alpine, so it can't replace Nix, and it brings
nothing the repo lacks elsewhere. No todo is filed.

## 1. What Nix does in the image today

Each row is something the backend or the image depends on. The code wins
over this table if they disagree.

| Job | How Nix does it | Where |
|---|---|---|
| Install and remove a GUI app as the shell user | `nix profile add nixpkgs#…`, `nix profile remove`, `nix profile list --json` | `apps/backend/src/modules/linux-apps/linux-apps.service.ts` |
| Run glibc programs on musl Alpine | Every package's closure carries its own glibc and libraries in `/nix/store` | [decisions-linux-apps.md](decisions-linux-apps.md) |
| Search offline, matching what installs | The pinned snapshot's `packages.json.br`, baked at build and checked against `NIXPKGS_COMMIT` | `infrastructure/nix/setup-image.sh`, `package-index.ts` |
| Move the pin and go back | `nix registry add nixpkgs`, `nix profile upgrade`, `nix profile rollback --to <generation>`, two pins kept | `linux-app-updates.service.ts`, [decisions-linux-apps-built.md](decisions-linux-apps-built.md) |
| Xwayland only once an X11 app needs it | A second profile, added and removed on its own | `xwayland.ts` |
| Start entries and Open with | `.desktop` files and MIME data from the profile's `share/` | `desktop-entry.ts`, `mime-globs.ts` |
| Show the store's size | `nix path-info --recursive` | `linux-apps.service.ts` |
| Fonts and the locale archive for every app | The base profile (`dejavu_fonts`, `glibcLocalesUtf8`) in the image's `/nix` | `setup-image.sh` |
| Never compile on the machine | `max-jobs = 0`, binaries only from `cache.nixos.org`, checked against its key | `infrastructure/nix/nix.conf` |

## 2. What mise is

mise (jdx/mise, 2026.11.14 on npm on 2026-11-26) manages versions of
developer tools per project from a `mise.toml`, plus environment variables
and tasks. A tool comes from a backend: built-in `core` installers (Node,
Python and others), `aqua` and `github` release assets, language package
managers (`cargo`, `npm`, `pypi`, `go`, `gem`), `conda`, and plugins (`vfox`,
the legacy `asdf`). `ubi` is deprecated and goes in 2027.1.0.

What decides the question:

- **No GUI apps in the registry.** The registry holds a file per short name
  under `registry/` in the mise repo. `node` and `ripgrep` are there;
  `firefox`, `chromium`, `libreoffice` and `gimp` are not (checked
  2026-11-26).
- **The one route to Firefox doesn't help.** The `conda` backend installs a
  package and its dependencies from conda-forge without conda. conda-forge's
  `firefox` recipe repackages Mozilla's `linux-x86_64` tarball and lists no
  run dependencies, so GTK, X11, D-Bus and glibc have to come from the host.
  mise's own conda page says "a compatible libc or GPU driver still come from
  the host". Alpine has musl, so it wouldn't start. conda-forge's own test of
  the package runs it headless under Selenium.
- **It uses the host's libraries.** That's the whole difference from Nix.
  Nix shipping its own glibc is the reason the 2026-10-23 call could keep
  Alpine.
- **Alpine is its slow path.** The Node and Python pages say that on Alpine
  "mise currently compiles from source by default, because `all_compile`
  defaults to `true` there", until mise 2027.8.0. Without compiling, Node
  comes from unofficial-builds' musl flavour, which publishes no signature,
  so mise skips that check. On a 1 GiB VPS container, compiling Node is
  not an option.
- **No rollback.** `mise.lock` records resolved versions, URLs and
  checksums, but there are no profile generations and no `rollback`. Go
  back in Settings → Updates would have to be rebuilt by hand.
- **Plugins run code.** mise's security page says plugins and install
  scripts "can run with your permissions during installation". The aqua
  and github backends check checksums, Cosign, SLSA and GitHub attestations
  where the publisher provides them.

## 3. Side by side

| Need | Nix (today) | mise |
|---|---|---|
| GUI app with its libraries on musl | Yes, the closure is self-contained | No, libc and libraries come from the host |
| Installs without root | Yes, `/nix` belongs to `imbatranim` | Yes, `~/.local/share/mise` |
| One pinned snapshot for every install | Yes, one nixpkgs commit | Per-tool versions in `mise.toml` and `mise.lock` |
| Offline package list for search | Yes, `packages.json.br` | No equivalent |
| Roll back an update | Yes, generations | No |
| Desktop entries and MIME types | Yes, from the profile | No, executables only |
| Builds nothing on the machine | Yes, `max-jobs = 0` | No on Alpine by default, until 2027.8.0 |
| Package size in Alpine 3.24 | `nix` 2.31.5, 23.1 MB installed | `mise` 2025.12.13, 29.9 MB installed |

Neither package size is a reason either way. Both are before their shared
libraries, and the cost that matters is the apps (Firefox's closure is
1.4 GiB unpacked). Alpine's `mise` is also eleven months behind upstream.

## 4. Other jobs mise could take

- **The repo's own toolchains.** The Dockerfile pins `node:24.22.1-alpine`
  and `rust:1.97-alpine`, `.nvmrc` says `24.22.1`, and `npm run dev` runs
  in the dev container. A `mise.toml` would help only someone building
  outside Docker, and it's one more tool to keep in step with the Dockerfile.
  Not worth it now. If host builds ever become a supported path, it's a
  cheap option then.
- **A user's runtimes in the Terminal.** Already possible with nothing
  shipped: `nix profile add nixpkgs#nodejs_24`, or
  `nix profile add nixpkgs#mise` for someone who prefers mise (2026.5.12 at
  the pin). Both exist at the pinned commit. Settings → Linux apps lists GUI
  programs, so neither would show there.

## 5. What would change the call

- The OS moving to a glibc base where the owner accepts installs needing
  root. That would reverse [decisions-linux-apps.md](decisions-linux-apps.md),
  and pacman or apt would replace Nix, not mise.
- Dropping runtime installs of GUI apps. Then neither tool is needed in the
  image.

## 6. How this was checked

Read on 2026-11-26. mise.jdx.dev didn't resolve from this session, so its
docs came from `docs/` in the jdx/mise repository on GitHub, at `main`:
`lang/node.md`, `lang/python.md`, `dev-tools/backends/index.md`,
`dev-tools/backends/conda.md`, `dev-tools/mise-lock.md`, `security.md` and
`installing-mise.md`. The registry entries came from `registry/` in the same
repository. The Firefox recipe is `recipe/recipe.yaml` in
conda-forge/firefox-feedstock. Package sizes are from Alpine 3.24's
community `APKINDEX`. The nixpkgs checks are `pkgs/by-name/mi/mise/package.nix`
and `nodejs_24` in `all-packages.nix` at `7dcdd87373d7`.

Not run. The session's permission checks blocked an Alpine chroot and
running a downloaded mise binary, so no install was tried, on musl or glibc.
The claims above rest on mise's documentation and the conda-forge recipe,
not on a measurement.
