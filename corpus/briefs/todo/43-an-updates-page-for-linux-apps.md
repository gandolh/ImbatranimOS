# Brief 43 — An Updates page for Linux apps

## Context

Linux apps come from one pinned nixpkgs commit, today `nixos-26.05` at
`7dcdd873` (`infrastructure/nix/nixpkgs-pin.env`), and only a new image moves
it. Grilled with the owner on 2026-11-04: an **Updates** page in Settings,
styled after Windows Update and macOS Software Update, that moves the pin and
**every installed app together**, keeps the previous pin so the move can be
undone, and offers a new NixOS release separately from fixes. The OS has a
single owner, so there's no question of who may update.

## Spec

1. **Settings → Updates** (or a section of Settings → Linux apps if that reads
   better beside it; record the choice). It shows the current release and
   commit, when it was last checked, and a **Check for updates** button.
2. **Updates:** the newest commit on the current release's channel
   (`channels.nixos.org/nixos-26.05`). If newer than the pin, the page lists
   the installed apps whose versions change (old → new) and offers
   **Update**.
3. **Upgrade:** when a newer release's channel exists (26.11 is due around the
   end of November 2026), it shows separately as "Upgrade to 26.11", with the
   same list, and the owner chooses when to take it.
4. **Update / Upgrade** moves the pin, builds the package index for the new
   commit, and rebuilds every installed app on it, with progress. The
   previous pin and its apps stay on disk.
5. **Go back** returns to the previous pin and its apps. Only the current and
   the previous pin are ever kept; moving again deletes anything older (Nix
   garbage collection).
6. Running Linux apps keep running on the old build until relaunched; the
   page says so.

## Must preserve

- Boot never downloads (brief 01's self-contained image): checking and
  updating happen only when the owner presses a button.
- The shell user, no root; the Nix volume's layout.
- A new image still sets the pin, and an image whose pin is newer wins.

## Acceptance

- In the dev container, against a pin moved back on purpose: Check finds the
  newer commit and lists the changed apps; Update moves the pin and the apps;
  Go back restores both; a second move leaves two pins on disk, not three.
- Tests for the channel check, the version diff and the pin bookkeeping pass.

## Files you OWN

- `apps/backend/src/modules/linux-apps/` (the check, the move, the index)
- `apps/core/src/modules/settings/` (the page)
- `infrastructure/nix/` where the pin file is read
