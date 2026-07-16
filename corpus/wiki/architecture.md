---
summary: The ImbatranimOS stack — Ubuntu 26.04 base, LXQt 2.3 on X11, SDDM/PipeWire, Flatpak + Discover, Calamares, nob.h C build driver in Docker — and the v2 migration path.
updated: 2026-07-16
---

# Architecture

## The stack (v1)

| Layer | Choice |
|---|---|
| Base | Ubuntu 26.04 LTS, minimal (debootstrap'd up from a clean base, not a remastered desktop ISO) |
| Display | X11 for v1 |
| Desktop | LXQt 2.3 (Qt 6, Openbox WM), Windows-7-classic layout: left start button, taskbar, tray+clock bottom-right, desktop icons, Win-key shortcuts |
| Login | SDDM with a custom QML theme |
| Plumbing | PipeWire (audio), NetworkManager (network), ext4 (installer default), zram swap on by default |
| Apps | Flatpak + Flathub via KDE Discover (Flatpak backend only); snapd stripped; Firefox from Mozilla's apt repo; updates = notify + one-click |
| Preinstall | ~10 apps: Firefox, VLC, PCManFM-Qt, LXImage-Qt, Ark, FeatherPad, qterminal, Discover, LXQt settings, Welcome app. English-only v1 |
| Installer | Calamares — dual-boot alongside Windows supported; Secure Boot via Ubuntu's signed shim; hybrid UEFI + legacy BIOS ISO |
| Theming | Forked Fluent family as skeleton, rendered black & white retro-simple with parameterized accent colors; wallpapers, Plymouth/SDDM look, fonts, ~20 surface icons |
| Welcome app | Qt Quick / QML first-boot app: tour + system status check |
| Floor | 2GB RAM min (zram), 4GB recommended, dual-core, ~20GB disk |

## Build system

Hand-rolled four-step pipeline, living in this git repo. **Local runs only,
no CI.**

```
1. debootstrap   minimal Ubuntu 26.04 rootfs into a folder
2. chroot        run versioned .sh step files: install LXQt, strip snapd,
                 apply themes/branding, install casper
3. mksquashfs    compress rootfs → filesystem.squashfs
4. xorriso       assemble squashfs + kernel + GRUB into bootable .iso
```

**Driver: `build.c` using tsoding's nob.h** (header-only; the build script
is a self-rebuilding C program). It owns sequencing, flags (`--clean`,
`--from-step`), rootfs caching, and error handling; the chroot payloads stay
as small `.sh` files it copies in and executes.

**Host: privileged Docker container on WSL2** (pinned Ubuntu tool image —
reproducible, host untouched). The ISO is tested from Windows-side
VirtualBox/Hyper-V. Fallback if chroot-in-container misbehaves: a dedicated
Hyper-V Ubuntu VM. Reference implementation to crib from:
[AnduinOS](https://github.com/Anduin2017/AnduinOS) (same pipeline, bash).

**Distribution: build-from-source.** Friends clone the repo and run the
build; the ISO lands in gitignored `dist/`. The README and a reproducible
one-command build are therefore product surface, not internal tooling.

## Planned repo layout

```
build.c            nob.h driver — the whole pipeline
nob.h              vendored, pinned
docker/Dockerfile  pinned build-tools image
steps/NN-*.sh      chroot payload scripts, run in order
config/packages/   package lists (base.list, desktop.list, apps.list)
config/rootfs/     overlay tree copied onto the rootfs (panel config,
                   openbox rc.xml, sddm/plymouth conf, os-release, skel)
assets/            wallpapers, icons, plymouth + sddm theme sources
welcome/           QML welcome app
dist/              build output (gitignored)
```

## Update model

**ISO releases only.** Installed machines keep receiving Ubuntu package
updates, but ImbatranimOS customizations are frozen at install time. Version
drift accepted; a custom apt repo + meta-package can be added later if it
hurts.

## The v2 path (deliberate, not v1)

LXQt's "bring your own compositor" design is the migration route:

1. v1: LXQt on X11/Openbox (Openbox is labwc's direct ancestor).
2. v2: switch compositor to **labwc (Wayland)** under the same LXQt.
3. Then replace LXQt components one at a time (panel first, launcher second)
   with a **custom shell** (Quickshell/QML) — no big-bang rewrite.

The custom shell is the flagship ambition; it was deliberately deferred so v1
ships in weeks, not months.
