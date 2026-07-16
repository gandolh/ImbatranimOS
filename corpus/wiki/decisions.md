---
summary: All locked choices from the 2026-07-16 grilling sessions — architecture, build tech, and product/UX (layout, identity, boot support, updates, distribution) — do not relitigate without an explicit revisit and a log entry.
updated: 2026-07-16
---

# Decisions (locked)

Each entry is settled. Changing one requires an explicit revisit + a
`log.md` entry.

- **Ubuntu-remix path, not MS-DOS / Windows-wizard / from-scratch.** The goal
  is a shareable branded product; only the remix path puts effort on UX
  instead of plumbing. (Research: MS-DOS is MIT-licensed but 16-bit dead end;
  modified Windows ISOs can't legally be redistributed; ReactOS shows
  from-scratch is decades of work.)
- **Base: minimal Ubuntu LTS**, built up from a clean base (debootstrap), not
  a stripped desktop ISO. Best hardware story, Googleable problems, 5-year
  support.
- **Desktop: LXQt on X11 for v1.** Chosen over Plasma (heavier), GNOME+
  extensions (heaviest, breakage risk), XFCE (Wayland not production-ready),
  and raw labwc+custom shell (months before friend-usable). X11 over Wayland
  for v1 because LXQt's X11 mode is its most stable.
- **Custom shell deferred to v2**, reached gradually: labwc compositor swap
  first, then replace LXQt components piecewise.
- **Flatpak + Flathub; snapd stripped.** Firefox from Mozilla's apt repo.
- **Preinstall: minimal curated set (~10 apps).** No office suite, no mail
  client — friends grab those from the store.
- **Updates: ISO releases only.** No custom apt repo for now; drift accepted.
- **Build: scripted debootstrap + live-build in git, local-only, no CI.**
- **Installer: Calamares.** (ubiquity is dead; subiquity is server-oriented.)
- **Branding v1: visible layer + custom Qt Welcome app.** Custom settings hub
  is v2/v3.
- **Audience: tech-tolerant friends on mixed hardware.** Not an
  elderly-focused accessibility OS.
- **v1 finish line: friend-install bar.** A friend installs from USB on real
  hardware unaided; boots, Wi-Fi, audio, browser + store, Welcome app all
  work, ImbatranimOS branding everywhere. Rough edges allowed if nothing
  blocks daily basics.

## Build-tech decisions (second grilling, 2026-07-16)

- **Pipeline: hand-rolled, not live-build/Cubic/AnduinOS-fork.** The four
  steps (debootstrap → chroot customize → mksquashfs → xorriso ISO) are
  driven by our own code, with AnduinOS as a public reference to crib from.
- **Build language: C via nob.h (tsoding), hybrid shape.** `build.c` owns
  orchestration — step sequencing, flags (`--clean`, `--from-step`), rootfs
  caching, logging, error handling. Chroot payloads stay small versioned
  `.sh` step files the driver copies in and executes. Not pure-C (quoting
  hell), not pure-bash (weak error handling; C is more fun here).
- **Base: Ubuntu 26.04 LTS** — LXQt 2.3 on Qt 6, Kvantum theming already
  default, longest runway, and the LXQt generation the Wayland v2 path
  needs. 24.04 rejected: Qt5-era LXQt means redoing theming work later.
- **Login: SDDM.** Qt/QML-themed login screen; QML skills compound toward
  the Welcome app and the v2 custom shell. Plumbing defaults with no
  contest: PipeWire (audio), NetworkManager (network), ext4 (installer
  default).
- **Theming: identity layer over a forked Fluent skeleton.** Fork
  vinceliuice's Fluent family (GTK + Kvantum + icons) for structure and
  coverage; ImbatranimOS identity lives where eyes land — palette/accent,
  wallpapers, Plymouth/SDDM look, fonts, ~20 hand-made surface icons (logo,
  start button, default pins). Full from-scratch theme grows across v2/v3;
  "own identity from scratch now" was explicitly considered and deferred
  (months of icon/theme work on the v1 critical path).
- **Welcome app: Qt Quick / QML** (not Widgets, not PySide — no Python
  runtime in the base image).
- **App store: KDE Discover with only the Flatpak backend** — Qt-native,
  single visible source (Flathub). Bazaar rejected (GTK4/young), GNOME
  Software rejected (heaviest).
- **Build host: Docker privileged container on WSL2.** Pinned Ubuntu tool
  image keeps the build reproducible and the host untouched; the resulting
  ISO is tested from Windows-side VirtualBox/Hyper-V. Fallback if
  chroot-in-container fights back: dedicated Hyper-V Ubuntu VM.

## Product/UX decisions (third grilling, 2026-07-16)

- **Desktop feel: Windows 7 / classic layout** — left start button, compact
  start menu, left-aligned taskbar, tray + clock bottom-right. Easiest with
  stock LXQt and lightest; deliberately retro-charming.
- **Visual language: modern flat on the classic layout** (Zorin-classic
  style), NOT Aero glass — keeps the Fluent-fork skeleton valid, no
  compositor blur needed.
- **Identity: classy black & white, simple retro style, with accent colors.**
  Monochrome base theme; accents parameterized (one variable) and chosen
  from rendered mockups during the theming work. Amber/gold explicitly
  rejected. The name stays ImbatranimOS (Romanian "we're aging" as a
  time-passing joke; sounds amusingly Spanish).
- **Desktop behaviors on by default**: desktop icons (pcmanfm-qt
  --desktop), Win key opens start menu, Win+E/Win+D/Win+L/Alt+Tab
  Windows-style shortcuts in Openbox rc.xml.
- **Hardware floor: 2GB RAM (zram on by default), 4GB recommended**,
  dual-core, ~20GB disk. Hybrid ISO boots **UEFI and legacy BIOS**.
- **Secure Boot supported via Ubuntu's Microsoft-signed shim/GRUB chain**;
  no BIOS visits for friends. **Dual-boot alongside Windows supported** in
  Calamares.
- **Updates: notify + one-click install** (tray notifier, Lubuntu's
  update-notifier as reference), not silent-auto and not manual-only.
  Flatpak apps update in background.
- **Language: English only for v1.** Locale packs are a later addition.
- **Media player: VLC** (familiar to Windows users, Qt-based). Other slots
  are LXQt stock: qterminal, FeatherPad, PCManFM-Qt + LXImage-Qt + Ark.
- **Versioning: semantic** — v1.0 = friend-install bar met; v2 = the
  Wayland/custom-shell era.
- **Distribution: build-from-source.** Friends clone the repo and run the
  build; the ISO lands in a gitignored `dist/` folder. No hosted ISO
  downloads for now — makes the README + reproducible build first-class.
  (Ad-hoc sharing of a locally built ISO remains fine.)
- **Welcome app v1 scope: tour screens + system status check** (updates,
  disk space, driver notes). Optional-apps picker and look-settings
  shortcuts deferred.
