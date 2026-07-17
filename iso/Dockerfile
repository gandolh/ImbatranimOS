# ImbatranimOS kiosk-ISO build image.
#
# An Alpine 3.22 toolbox that produces the bootable kiosk ISO with the
# official aports `mkimage.sh` pipeline. Everything runs UNPRIVILEGED as the
# `build` user (abuild group) via fakeroot — no chroot / loop mounts — which
# is what lets it work in ordinary Docker on WSL2. (Privileged Docker is the
# known-good fallback if a host ever rejects the fakeroot path.)
#
# Pinned to alpine:3.22 so the ISO's runtime packages (nodejs, chromium,
# cage, seatd…) and the native node addons we compile here share one ABI.
FROM alpine:3.22

# Build + image tooling.
#   alpine-sdk        abuild, git, build-base (compiles our native node addons)
#   alpine-conf       setup-* helpers used by mkimage / update-kernel
#   apk-tools         apk index + fetch inside mkimage
#   xorriso           ISO9660/El-Torito authoring
#   syslinux          BIOS (isolinux) boot
#   grub grub-efi     UEFI boot (mkimage builds a hybrid BIOS+UEFI ISO)
#   mtools dosfstools  the EFI FAT boot image
#   squashfs-tools    modloop + rootfs squashfs
#   fakeroot          the unprivileged root-emulation path
#   nodejs npm        build the production payload (musl, correct ABI)
#   python3 make g++  native addons: better-sqlite3, node-pty, argon2
RUN apk add --no-cache \
      alpine-sdk alpine-conf apk-tools \
      xorriso syslinux grub grub-efi mtools dosfstools \
      squashfs-tools fakeroot \
      bash sudo \
      nodejs npm python3 make g++

# Unprivileged builder in the abuild group (abuild refuses to run as root).
RUN adduser -D build && addgroup build abuild
# abuild needs to install its generated signing pubkey into /etc/apk/keys and
# to `apk add` build deps; allow just that via sudo (build image only, never
# ships in the ISO — the booted system's imbatranim user has no sudo).
RUN echo 'build ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

USER build
WORKDIR /work
# Generate + install an abuild signing key so our custom .apk and its local
# repo index are signed and trusted by mkimage.
RUN abuild-keygen -a -i -n

ENTRYPOINT ["/bin/bash"]
