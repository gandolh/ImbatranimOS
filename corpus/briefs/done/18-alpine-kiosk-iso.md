# Task 18 — Alpine kiosk ISO: boot straight into the browser

> **Outcome (2026-07-17, done):** Landed in commit `bac2b99` (+ a passwd
> `-u`→`-l` review fix in `b46f64e`). `./build iso` works unprivileged
> (fakeroot) in Docker on WSL2, first try. Open questions resolved: app
> delivery = signed custom `.apk` (overlay stays ~950 B); autologin =
> greetd; kernel lts, stateless tmpfs. Measured: **580 MiB** hybrid
> BIOS+UEFI ISO, RAM floor **2 GB**, boot-to-login < ~2 min under KVM
> emulation. KVM-boot-verified (qemu in Docker, /dev/kvm): fullscreen
> chromium showing the first-run login, no console/shell — two launcher
> bugs found+fixed this way. Human-gated: UEFI live boot,
> VirtualBox/Hyper-V, real hardware, interactive walkthrough. Full
> detail: log.md 2026-07-17 + iso/README.md.

## Context

Bare-metal variant of the web-OS (user-requested 2026-07-17): a bootable
Alpine-based ISO whose entire visible interface is **one fullscreen
browser** — no desktop environment, no window manager chrome, no visible
console. The browser renders the same web UI the Docker product serves;
the backend server runs locally on the booted machine, so the user
reaches "OS capabilities" (terminal, files, monitor…) through server +
web UI exactly as in the container. Chromium first; a
pick-your-browser expansion (firefox, others) is explicitly later.

Goals: **minimal resources** and **broad hardware compatibility** (old
laptops, VirtualBox/Hyper-V/QEMU). Keep it simple: render just the
browser, nothing else.

**Relation to locked decisions** ([decisions.md](../../wiki/decisions.md)):
"Runtime: Docker container… bootable/kiosk variants are explicitly not
v1" stays true — this brief IS that post-v1 variant, as its own
artifact. `docker run` + browser remains the primary dev/test loop; the
ISO is tested occasionally in a VM by the user. All invariants carry
over: `imbatranim` user no sudo, auth on every route (no kiosk
auto-login into the web UI), lightweight as identity.

**Build tooling** (user-specified): a C driver + vendored `nob.h` +
`.sh` steps produce the ISO — the same pipeline shape as the superseded
ISO era (briefs 01–07). Durable finding carried over: that era
smoke-tested chroot/squashfs tooling in privileged Docker on WSL2 and it
PASSED.

## Research findings (2026-07-17)

### Kiosk stack: cage + chromium on Wayland

- **cage** — a wlroots Wayland compositor that runs exactly one
  application fullscreen and nothing else — is the purpose-built tool;
  packaged in Alpine community (0.2.0-r0 in v3.22). Needs **seatd**
  (seat management for wlroots) and udev (`eudev`) for input/GPU.
- Proven recipe (rik-shaw/alpine-cage-kiosk, born from
  cage-kiosk/cage#423): `setup-wayland-base` (pulls elogind +
  polkit-elogind) + **greetd** as autologin — greetd's config execs a
  launch script as an unprivileged user, which runs
  `cage -- <browser> --kiosk <url>`. Alternative, fewer moving parts:
  agetty autologin on tty1 + profile exec, or a dedicated OpenRC
  service; the X11 equivalent (inittab `login -f` + `startx` +
  `chromium --kiosk`) is the Alpine wiki's classic signage recipe and
  ran a full kiosk in a **~235 MB image**.
- Hardware compat: wlroots rides KMS/DRM with software rendering
  (llvmpipe) fallback — fine for VMs and old GPUs; the X11 route with
  `xf86-video-vesa`/`fbdev` is the fallback plan if cage misbehaves on
  some target. Decide cage-first, keep X11 as plan B.
- **cog/wpewebkit** (the embedded-kiosk browser) is NOT packaged in
  Alpine 3.22 — ruled out for now.

### Browser: chromium first (confirmed right call)

- Alpine 3.22 community chromium 142: **117 MiB package / 263 MiB
  installed** (+ mesa/fonts deps). Kiosk flags from the signage recipe:
  `--kiosk --no-first-run --incognito --noerrdialogs
  --disable-translate --disable-infobars --disk-cache-dir=/tmp
  --window-size=…`.
- firefox on Alpine + cage works but a real-world report measured ~1 GB
  storage and ~1 GB idle RAM — chromium is the lighter default;
  browser choice becomes a build knob later.

### ISO build: aports mkimage with a custom profile

- Official path: `aports/scripts/mkimage.sh` + two files we own —
  `mkimg.imbatranim.sh` (profile: `kernel_flavors`, `apks`,
  `kernel_cmdline`, `boot_addons`, `image_ext=iso`) and
  `genapkovl-imbatranim.sh` (the `/etc` overlay tarball: OpenRC
  `rc_add` wiring, greetd/agetty config, our services).
- Build env: an **Alpine container** with `alpine-sdk build-base
  apk-tools alpine-conf busybox fakeroot syslinux xorriso` and a
  non-root user in `abuild` group; community wrappers run mkimage in
  Docker routinely. Expected to work unprivileged (fakeroot, no
  chroot/loop mounts) — smoke-test this EARLY on WSL2; privileged
  Docker is the known-good fallback.
- Kernel flavor: **lts** (what the standard profile ships) covers real
  hardware AND VMs; `virt` is smaller but VM-only. Ship lts; a slim
  virt profile can come later.
- mkimage's x86_64 ISOs are hybrid BIOS+UEFI out of the box (syslinux +
  grub-efi).

### Runtime model: diskless (run-from-RAM)

- Alpine ISOs boot **diskless**: kernel + initramfs, then the apks
  bundled on the ISO install into tmpfs; `apkovl` overlays `/etc`.
  Everything runs from RAM — good fit for a kiosk appliance (no
  install step, storage untouched).
- RAM budget estimate: tmpfs rootfs (~0.5 GB with chromium + nodejs +
  our app) + chromium runtime + node runtime → **target ≥ 1.5–2 GB RAM
  machines**; measure the real floor at build time. A `setup-disk` sys
  install is the later path for low-RAM hardware.

Sources: [Alpine wiki: custom ISO with mkimage](https://wiki.alpinelinux.org/wiki/How_to_make_a_custom_ISO_image_with_mkimage),
[alpine-cage-kiosk](https://github.com/rik-shaw/alpine-cage-kiosk),
[cage-kiosk/cage#423](https://github.com/cage-kiosk/cage/issues/423),
[Alpine signage/kiosk recipe](https://dev.to/nesterow/setup-minimal-kiosk-environment-with-alpine-linux-27b),
[chromium pkg v3.22](https://pkgs.alpinelinux.org/package/v3.22/community/x86_64/chromium),
[cage pkg v3.22](https://pkgs.alpinelinux.org/packages?name=cage&branch=v3.22),
[fvanniere/alpine-custom](https://github.com/fvanniere/alpine-custom),
[Alpine diskless mode](https://wiki.alpinelinux.org/wiki/Diskless_Mode),
[2025 sway/firefox miniPC kiosk](https://giuliomagnifico.blog/post/2025-04-24-minipc-kiosk/).

## Files you OWN

- `iso/**` (new top-level dir): `build.c`, vendored pinned `nob.h`,
  `scripts/mkimg.imbatranim.sh`, `scripts/genapkovl-imbatranim.sh`,
  helper `.sh` steps, `README.md`.
- Root README: one section pointing at `iso/` (docker stays the headline).
- Corpus bookkeeping at completion.

## Files you must NOT touch

- `apps/**` — the ISO consumes the backend + built core statics as
  artifacts; no app code changes for kiosk's sake without a revisit.
- `infrastructure/**` (Dockerfile/compose/entrypoint) — the docker
  product is untouched by this brief.

## What to do

1. **Vendor nob.h + write `build.c`**: targets like `./build iso`
   (and `./build clean`); orchestrates a Docker run of the Alpine build
   container, which clones/pins aports and invokes `mkimage.sh
   --profile imbatranim --arch x86_64`. Shell steps stay thin and
   inspectable.
2. **Profile** (`mkimg.imbatranim.sh`): lts kernel; apks = base +
   `nodejs` + `chromium cage seatd eudev dbus` + fonts; bundle the
   backend (built `apps/backend` + core statics + production
   node_modules) into the image — mechanism per open question below.
3. **Overlay** (`genapkovl-imbatranim.sh`): OpenRC services — backend
   server as `imbatranim` user on localhost; autologin (greetd or
   agetty+profile) exec-ing `cage -- chromium --kiosk
   http://localhost:8080` with the flag set above; no getty on the
   kiosk VT, quiet boot.
4. **Verify**: boot the ISO in QEMU (and note VirtualBox/Hyper-V
   behavior); confirm the machine shows ONLY the browser rendering the
   login screen; log in, use terminal/files; record RAM floor +
   ISO size in status metrics.

## Acceptance

- `./build iso` (compiled from `build.c` via nob) produces
  `imbatranimos-<version>-x86_64.iso` reproducibly on WSL2 with Docker.
- The ISO boots BIOS and UEFI in at least QEMU + one of
  VirtualBox/Hyper-V, straight into fullscreen chromium showing the
  ImbatranimOS login — no console, no DE, no cursor flash to a shell.
- Full auth flow + terminal + files work against the local backend.
- Docker dev loop untouched; a fresh clone still follows the README
  docker path with zero new prerequisites.
- Measured: ISO size, boot-to-login time, idle RAM — recorded in
  status.md metrics.

## Open questions (grill agenda when this is picked up)

- **App delivery into the image**: build our own .apk (clean, apkovl
  stays tiny) vs tarball inside the overlay (simpler, fatter) vs
  baking into the initramfs. Leaning .apk — decide at grill time.
- **RAM floor**: measured, not guessed — does 1 GB work with zram, or
  is 2 GB the honest minimum?
- **Kiosk-mode auth UX**: login every boot (invariant-clean) — is a
  device-local session persistence story wanted later? (apkovl/lbu
  commit vs stateless).
- **Browser knob**: where the chromium/firefox switch lives when the
  expansion comes (profile variable, most likely).
