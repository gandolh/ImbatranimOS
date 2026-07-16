# Task 04 — App layer: Flatpak/Discover, Firefox, VLC, update notifier

## Context

The "apps" promise (corpus/wiki/decisions.md): Flatpak + Flathub via KDE
Discover (Flatpak backend ONLY), snapd stripped and pinned out, Firefox
from Mozilla's apt repo, VLC, and the notify + one-click update model
(Lubuntu's update-notifier as reference). Depends on brief 01; independent
of 02/03.

## Files you OWN

- `config/packages/apps.list`
- `steps/50-apps.sh`
- `config/rootfs/etc/apt/preferences.d/nosnap.pref` (pin snapd priority
  -1) and Mozilla repo config (`sources.list.d` + keyring)
- Flatpak/Flathub setup + Discover backend config
- Update-notifier configuration (apt periodic check + tray notify +
  one-click flow; flatpak background updates on)

## Files you must NOT touch

- Theme assets (03), panel config (02), `build.c` (01)

## What to do

1. `steps/50-apps.sh`: add Mozilla apt repo (signed-by keyring), install
   firefox (deb, NOT snap transition package — verify), vlc, ark,
   featherpad, lximage-qt, qterminal if not in desktop.list.
2. Remove/pin snapd; verify no package in the set pulls it back
   (`apt-get install --dry-run` check in the step, fail the build if snapd
   would install).
3. flatpak + flathub remote system-wide; plasma-discover with
   plasma-discover-backend-flatpak ONLY (no packagekit backend — apt stays
   the build's business, not the user's).
4. Update path: unattended-upgrades NOT enabled; instead apt periodic
   update checks + lubuntu-update-notifier (or equivalent Qt notifier)
   giving a tray prompt with one-click install. Flatpak auto-updates on
   (Discover background updates).
5. Keep the preinstall honest: after this step the app menu shows ~10
   apps, nothing more (no games, no duplicate tools from dependency
   creep — check and trim recommends with APT::Install-Recommends "false"
   where sane).

## Acceptance

On a booted ISO: Discover opens, shows only Flathub, installs a Flatpak
(e.g. an app of choice) without terminal; `snap` does not exist and
`apt-get install snapd` is refused by the pin; Firefox is the deb and
plays a YouTube video with sound; update notifier appears when updates are
staged (test by building with one held-back package or a dated mirror
snapshot).
