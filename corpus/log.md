# Log

## [2026-07-16] decision | Architecture locked after research + grilling session

Researched four paths (MS-DOS base, Windows debloat wizard, Ubuntu/Arch
remix, from-scratch) and grilled every branch. Locked: minimal Ubuntu LTS
base, LXQt on X11 for v1 (labwc/Wayland + custom shell as v2 path),
Flatpak/no-snap, ~10-app curated preinstall, ISO-releases-only updates,
scripted debootstrap + live-build with local-only runs (no CI), Calamares,
visible branding + custom Qt Welcome app, friend-install bar as the v1
finish line. Full record in [wiki/decisions.md](wiki/decisions.md).

## [2026-07-16] maintenance | Corpus bootstrapped

Created the corpus skeleton (CLAUDE.md, index, routing, lint, wiki spine)
and seeded the wiki from the session's findings. Repo was empty before this.

## [2026-07-16] decision | Build-tech grilling: pipeline, language, versions, theming, host

Second grilling session resolved every technical unknown: hand-rolled
4-step pipeline (debootstrap/chroot/mksquashfs/xorriso) with AnduinOS as
reference; **build.c on tsoding's nob.h** driving versioned `.sh` chroot
steps (hybrid shape); **Ubuntu 26.04 LTS** (LXQt 2.3/Qt6/Kvantum); SDDM +
PipeWire + NetworkManager; theming = forked Fluent skeleton + ImbatranimOS
identity layer (from-scratch identity considered, deferred — same shape as
the labwc deferral); Welcome app in QML; KDE Discover Flatpak-only;
**privileged Docker on WSL2** as build host with Hyper-V VM fallback.
Details in [wiki/decisions.md](wiki/decisions.md); resolved items cleared
from [wiki/open-questions.md](wiki/open-questions.md).

## [2026-07-16] decision | Product/UX grilling: layout, identity, boot, updates, distribution

Third grilling closed every documentation gap: Win7-classic layout in
modern flat (not Aero), desktop icons + Win-key + Windows shortcuts,
2GB-with-zram floor (4GB rec), hybrid UEFI+BIOS ISO, Secure Boot via
Ubuntu shim, dual-boot supported, notify+one-click updates, English-only
v1, VLC, B&W retro-simple identity with parameterized accents (mockup
pick inside brief 03), semantic versioning, build-from-source
distribution (clone + build, ISO in dist/), Welcome app = tour + status
check. Full record in [wiki/decisions.md](wiki/decisions.md).

## [2026-07-16] todo | Briefs 01-07 filed — the complete v1 path

Filed seven briefs decomposing v1: 01 build-scaffold, 02
desktop-experience, 03 identity-theming, 04 app-layer, 05 installer, 06
welcome-app, 07 v1-release. Dependency order and one-liners in
[wiki/status.md](wiki/status.md). scaffold-iso-build todo marked promoted
into brief 01.
