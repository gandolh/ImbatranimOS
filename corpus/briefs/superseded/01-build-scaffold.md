> SUPERSEDED 2026-07-16: project pivoted from installable ISO distro to web-OS-in-a-container (see wiki/decisions.md "The pivot itself" + log.md). ISO-era spec kept for the record.

# Task 01 — Build scaffold: Docker image + build.c pipeline + first bootable ISO

## Context

Everything downstream needs a working pipeline. This brief creates the repo
skeleton and proves the riskiest assumption early: that debootstrap + chroot
+ mksquashfs work inside a privileged Docker container on WSL2 (fallback if
not: Hyper-V Ubuntu VM — see corpus/wiki/open-questions.md). Promoted from
corpus/todos/scaffold-iso-build.md. All stack choices are locked in
corpus/wiki/decisions.md; pipeline + repo layout in
corpus/wiki/architecture.md. Reference implementation (same pipeline, bash):
https://github.com/Anduin2017/AnduinOS

## Files you OWN

- `build.c`, `nob.h` (vendor a pinned release from https://github.com/tsoding/nob.h)
- `docker/Dockerfile` (pinned ubuntu:26.04 tool image: debootstrap,
  squashfs-tools, xorriso, grub tools, dosfstools, mtools, gcc)
- `steps/10-base.sh`, `steps/20-desktop.sh` (minimal first versions)
- `config/packages/base.list`, `config/packages/desktop.list`
- `.gitignore` (dist/, cache/), `README.md` (build instructions — this is
  product surface: distribution model is clone + build)

## What to do

1. **Smoke test FIRST**: in the privileged container, debootstrap a minimal
   Ubuntu 26.04 (noble→resolute; verify codename) rootfs, chroot in, run
   `apt-get update`, bind-mount /proc /sys /dev, mksquashfs it. If any step
   fails fundamentally on WSL2, STOP and report — the fallback decision
   (Hyper-V VM) must be taken consciously, not worked around silently.
2. Write `build.c` on nob.h: steps = debootstrap (cached as tarball in
   `cache/`) → copy+run `steps/*.sh` in-chroot in order → mksquashfs →
   ISO assembly. Flags: `--clean`, `--from-step=N`. Fail loudly on any
   step's non-zero exit.
3. ISO assembly: casper live-boot layout, GRUB hybrid boot for UEFI +
   legacy BIOS, Ubuntu's signed shim/grub-efi-amd64-signed for Secure Boot.
   (SB verification on real hardware can defer to brief 07; the shim files
   must be in place now.)
4. `steps/10-base.sh`: base system, kernel (linux-generic), casper,
   NetworkManager, PipeWire, zram (zram-tools or systemd zram-generator),
   no snapd (and apt-pin it never to return).
5. `steps/20-desktop.sh`: LXQt 2.3 + SDDM from Ubuntu repos, stock config
   for now (branding is briefs 02/03).

## Acceptance

`docker run --privileged … ./build` from a clean clone produces
`dist/imbatranimos-*.iso` that boots in VirtualBox (BIOS) and Hyper-V
(UEFI) to a stock LXQt desktop with working network and audio. README
instructions reproduce this from scratch. Rebuild with `--from-step`
skips debootstrap via cache.
