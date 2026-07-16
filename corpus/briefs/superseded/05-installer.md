> SUPERSEDED 2026-07-16: project pivoted from installable ISO distro to web-OS-in-a-container (see wiki/decisions.md "The pivot itself" + log.md). ISO-era spec kept for the record.

# Task 05 — Installer: Calamares with dual-boot and Secure Boot

## Context

The install path to the friend-install bar (corpus/wiki/decisions.md):
Calamares, dual-boot alongside Windows supported, Secure Boot via Ubuntu's
signed shim chain, ext4 default, English-only v1. Depends on briefs 01
(boot machinery, shim files) and 03 (branding for the slideshow).

## Files you OWN

- `config/rootfs/etc/calamares/` (settings.conf, modules/ configs,
  branding/imbatranim/ with slideshow QML)
- `steps/60-installer.sh`
- The live-session "Install ImbatranimOS" desktop entry

## Files you must NOT touch

- Theme assets outside calamares branding (03), app steps (04)

## What to do

1. Install calamares from Ubuntu repos; module sequence: welcome → locale
   (English default, keyboard still selectable) → partition → users →
   summary → exec → finished.
2. Partition module: "Erase disk", "Install alongside" (Windows/NTFS
   resize path — this is the dual-boot promise), and "Manual". ext4
   default, swap = none (zram covers it; confirm hibernation is out of
   scope for v1).
3. Bootloader: grub-efi with shim on UEFI, grub-pc on BIOS; verify the
   installed system (not just the live ISO) boots with Secure Boot ON.
4. Users module: friendly defaults — autologin checkbox, hostname
   defaulted from user name.
5. Branding: ImbatranimOS logo/name, B&W slideshow (3-4 slides: what it
   is, the store, where help lives) using brief 03's assets.
6. os-prober on so installed GRUB offers Windows in dual-boot setups.

## Acceptance

In VMs: (a) erase-disk install on UEFI+SB-on boots to desktop; (b)
alongside-install on a disk with a Windows partition results in a GRUB
menu offering both OSes and both boot; (c) BIOS-mode erase-disk install
boots. Installer is fully branded, no Calamares stock branding visible.
