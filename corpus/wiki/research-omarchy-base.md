---
summary: Research (2026-11-26) on the owner's question whether imbatranimOS can, and then should, be based on Omarchy, DHH's Arch + Hyprland distribution (MIT, omacom/omarchy, 4.0.0.alpha on its default branch). Can, only in pieces. There is no Omarchy container; it installs from an ISO onto a disk (encrypted, Secure Boot off) with a boot loader and snapshots, its Hyprland desktop needs a seat and a GPU or a headless output plus an RDP server (DigitalOcean's image uses hypr-rdp), and normal use asks for sudo. Running the OS's container on an Omarchy machine works today, since Omarchy ships Docker. Should, no. It reverses "Alpine stays" (2026-10-23), weighs about 12 GB installed and about 2 GB of RAM idle against a ~150 MB image and a 1 GiB VPS cap, replaces the locked Win7-classic desktop with a tiling one, streams the whole screen as pixels where the tab is the display, and trades the pinned builds for a rolling Arch mirror. Its glibc base is the one gain, and Nix already gives that without root. A few ideas are worth keeping for the ISO if it comes back (first-boot owner setup, cloud-init installs). Nothing was installed or run.
updated: 2026-11-26
---

# Research: imbatranimOS on Omarchy? (2026-11-26)

The owner asked on 2026-11-26: "Can you research if we can and then if we
should base imbatranimOS over omarchy?" This page holds research only.
Nothing was built, installed or run.

**Verdict: can in pieces, should not.** No part of Omarchy fits inside the
container the OS is. The parts that could be made to fit (Arch as the base
image, Hyprland as a remote desktop) each undo a locked call and bring none
of what makes Omarchy Omarchy. No todo is filed.

## 1. What Omarchy is

Facts from its repository (omacom/omarchy, which basecamp/omarchy redirects
to) and its manual there, read 2026-11-26:

- "Omarchy is a beautiful, fun & agentic Linux distribution by DHH." The
  manual's own short form is "Omarchy is really Arch + Hyprland". MIT
  licence. The default branch, `quattro`, has `version` 4.0.0.alpha.
- "Omarchy is installed using an ISO", onto a whole drive or into free space
  beside another OS, encrypted by default. "You must turn off Secure Boot
  and/or TPM in the BIOS." Apple Silicon Macs install from macOS. VMs work
  (VirtualBox, "performance probably won't be great"; VMware; Proxmox).
- The ISO can install unattended from a cloud-init `cidata` drive (disk,
  user, password hash, SSH keys, a Tailscale key), "as a base image for VMs
  and fleet machines". A "prepare for another owner" install leaves user and
  password to the first boot.
- The base package list (`install/omarchy-base.packages`, 182 lines)
  includes `hyprland`, `sddm`, `plymouth`, `networkmanager`, `bluez`, `cups`,
  `docker`, `podman`, `libreoffice-fresh`, `google-chrome`, `obsidian`,
  `fcitx5`, `nodejs` and `mise-bin`. Third-party guides report about 12 GB
  installed and 2 to 2.3 GB of RAM at idle. The manual states no minimum.
- Updates come from `omarchy update`. Omarchy's own packages come from its
  package repository and the system's from an Arch mirror that runs "one
  month behind" on the stable channel, plus the AUR. A plain `pacman -Syu`
  is stopped and pointed at `omarchy update`. Every update takes a snapshot,
  and going back means booting it from the boot loader (systemd-boot or
  Limine).
- The user logs in and runs `sudo` with one password. Docker needs `sudo`
  by default. Switching kernels asks for the password. There is a
  "Passwordless Sudo" toggle for agents.
- Developer runtimes come through mise ("The majority of these environments
  are managed by Mise"). GUI programs come from pacman and the AUR.
- DigitalOcean's Marketplace has an Omarchy image reached over RDP on port
  3389 through hypr-rdp, an RDP server for Hyprland (from search snippets of
  DigitalOcean's page, which didn't load here).

## 2. Can we? What "based on" could mean

| Reading | Can it be done | What it takes |
|---|---|---|
| Omarchy as the container's base, in place of Alpine | Not as Omarchy | No Omarchy container image exists. Its installer expects a disk, a boot loader, LUKS and snapshots, all meaningless in a container. What can be done is `archlinux` as the base with some of Omarchy's packages from its repository, which is Arch, not Omarchy |
| Omarchy's Hyprland desktop as the OS's desktop, streamed to the owner | On a VM, yes; in our container, no | Hyprland wants a seat (logind or seatd) and a GPU render node, or a headless output with a remote-desktop server under it. The unprivileged container has no systemd, no `/dev/dri` and no user namespaces. On a VM it's DigitalOcean's RDP image: an RDP client, not a browser tab |
| The bare-metal ISO on Omarchy instead of Alpine | Yes | The unattended install would carry the container and a kiosk browser. The kiosk hides Hyprland, the part Omarchy is for. The ISO is deferred ([decisions-estate-era.md](decisions-estate-era.md)) |
| The OS's container running on an Omarchy machine | Yes, today | Omarchy ships Docker and Compose. `npm run dev` needs `sudo docker` or Omarchy's Sudoless Docker toggle. That's a host, not a base, and needs no change here |

## 3. Should we? No

Each reason is a locked call or a project invariant that a base on Omarchy
breaks.

- **Alpine stays.** [decisions-linux-apps.md](decisions-linux-apps.md)
  (2026-10-23) kept Alpine and rejected Debian, the owner's first pick, once
  Nix was on the table. Arch is the same trade as Debian, with a rolling
  release on top.
- **Lightweight is identity.** The image's target is about 150 MB, and on
  the VPS the container gets 1 GiB with no swap
  ([research-native-apps-via-wayland.md](research-native-apps-via-wayland.md)).
  Omarchy's idle desktop alone is about twice that cap.
- **The desktop is locked.** Win7-classic in Apricot and Classic
  ([decisions-themes.md](decisions-themes.md)). Omarchy's value is its
  keyboard-first tiling Hyprland desktop, its themes and its menu. Basing on
  Omarchy and hiding all of that leaves Arch.
- **The tab is the display.** Web apps reach the tab as data, and only a
  Linux app's window travels as pixels, one OS window per app window
  ([os-layering.md](os-layering.md), [decisions-linux-apps.md](decisions-linux-apps.md)).
  Hyprland over RDP streams the whole screen as pixels, so every keystroke
  in every app would cross the link. Measured for a Linux window on
  2026-11-06, that's a median 122-141 ms with 50 ms added each way, against
  9-12 ms in Notepad's field
  ([research-native-apps-via-wayland-measured.md](research-native-apps-via-wayland-measured.md)).
- **No sudo, no privileged container.** Omarchy's normal use asks for
  `sudo`: Docker, kernels, pacman through `omarchy update`. Linux apps
  install without root here only because Nix runs single-user on `/nix`.
  pacman can't do that.
- **Pinned builds.** The image pins its nixpkgs commit, its Node and Rust
  images and even its Dockerfile frontend. An Arch base moves with the
  mirror, and Omarchy's stable channel is a one-month lag, not a pin.
- **An alpha moving fast.** 4.0.0.alpha on the default branch. The GitHub
  page on 2026-11-26 showed 8,410 commits, about 2.9k open issues and 4.2k
  open pull requests. A base that size moving under the OS would cost
  upkeep with no change the owner sees.

The one technical gain is glibc. Closed Linux apps ship for glibc, and Arch
runs them natively. Nix already gives every Linux app its own glibc on
Alpine, and installs them without root, which Arch can't.

## 4. Worth borrowing, not basing on

Ideas from Omarchy that fit the OS's own rules, for the ISO if it comes
back. None is filed as a todo.

- **First-boot owner setup.** The "prepare for another owner" install puts
  no password on the image and lets whoever boots it first create the user.
  That's the same rule as "no default password" here.
- **Cloud-init installs.** A `cidata` drive carrying the configuration and
  SSH keys, for an ISO installed into a VM without a keyboard.

Its split matches this one. Omarchy uses mise for developer runtimes and a
real package manager for programs. Here Nix is that package manager
([research-mise-vs-nix.md](research-mise-vs-nix.md)).

## 5. How this was checked

Read on 2026-11-26. learn.omacom.io, docs.digitalocean.com and the
third-party review pages didn't resolve from this session. The manual came
from `manual/` in omacom/omarchy on GitHub, at `quattro`: `02-getting-started`,
`18-development-tools`, `30-updates`, `47-system-snapshots`, `48-security`,
`49-omarchy-on` and `51-unattended-installs`, with `README.md`, `version`
and `install/omarchy-base.packages`. DigitalOcean's RDP image and the size
and RAM figures come from web search results (DigitalOcean's catalog page
and third-party install guides), not from a page read in full. The
Hyprland points (`HEADLESS-0` when no display is found, a remote-desktop
server under the Hyprland process, `AQ_NO_KMS_REQUIREMENT` for a GPU with no
display) come from the Hyprland wiki's Virtual GPU page, through search.
Omarchy was not installed.
