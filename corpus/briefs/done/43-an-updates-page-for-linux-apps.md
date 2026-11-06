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

## Outcome (2026-11-06)

Built in `da8ae12` (1.170.0). Ready for test on the board: Check was walked
live, Update and Go back were not (see Skipped).

1. **Where it is.** Its own **Updates** section in Settings, right after
   Linux apps, rather than a part of that pane: the pane is already long
   (search, the job log, installed, keyboard, disk), and the update has its
   own state, offers and Go back. Its first line says it updates Linux apps
   and that the desktop itself updates with a new image. It shows the
   release and build (`NixOS 26.05, build 13446 (7dcdd873)`), when it was
   last checked, and **Check for updates**, in the Windows Update shape: a
   state line (up to date, updates available, checking, updating) with a
   check mark or download icon. The Linux apps pane leaves an update's log
   to it and says that installs wait while one runs.
2. **Check** is a job like an install. It follows `channels.nixos.org/<release>`
   to its snapshot on `releases.nixos.org`, checks that snapshot's
   `git-revision` against its name, then looks for the next release (26.05,
   26.11, 27.05...) the same way; a 404 means it isn't out. For each find it
   downloads the snapshot's `packages.json.br` into
   `/nix/var/imbatranim/linux-apps/pins/<commit>/` and builds the compact
   index, so the page compares the installed apps' versions between the two
   lists by attribute (old → new; apps rebuilt at the same version are
   counted; an app the new list lacks stays as it is). Snapshots are ordered
   by release, then build number; commits alone don't order.
   `releases.nixos.org` sends the list with `Content-Encoding: br`, so
   `fetch` would inflate it to about 380 MB: it is downloaded raw with
   `https.get` and kept compressed, as the image keeps its own.
3. **Update and Upgrade** show as separate cards ("Fixes for NixOS 26.05",
   "Upgrade to NixOS 26.11"), each with the list and a confirm. The move
   writes the user flake registry, `$NIX_CONFIG_HOME/registry.json` on the
   /nix volume, which Nix reads before the image's system registry (checked
   in the dev container), so `nixpkgs#…` follows it everywhere, the
   Terminal too. Then `nix profile upgrade` on every installed `nixpkgs`
   app the new list has (`--impure` when one is unfree), and on Xwayland's
   profile. On success it records the pin left behind with its profile
   generations, deletes every other generation, runs `nix store gc` and
   drops the other pins' lists: two pins on disk, never three. A failed
   rebuild puts the registry and the profiles back.
4. **Go back** rolls the user profile (and Xwayland's) back to the previous
   pin's generation and points the registry at it (removing the entry when
   it is the image's own pin). It is offline and instant, and exact: apps
   installed or removed since the update are as they were then, which the
   confirm says. A probe showed that moving the registry back and upgrading
   also downgrades, but the old pin's nixpkgs source is collected after a
   move, so that would download again. Free space (`nix-collect-garbage -d`)
   deletes the generation, and Go back disappears with it.
5. **The image still sets the pin.** `/nix/var/imbatranim/linux-apps/pins.json`
   holds the moved pin; at boot, an image whose pin is at least as new wins:
   the registry entry and Go back are dropped. Its apps stay at their old
   commit until the next Update, as after any new image. A Go back below the
   image's pin is never offered. Boot reads files only; only Check, Update,
   Upgrade and Go back run Nix or reach the network.
6. The page says that open Linux apps keep their old build until reopened.

**Decided myself**, open to the owner: the separate section (1); Go back as
an exact rollback (4); the image winning on an equal pin too (5); Check
needs no live desktop session (it changes no app), while the three moves do.

**Checks run.** Backend: tsc, eslint, jest for `linux-apps` (70 tests: the
channel check, the version diff, the state file, generations, and the
updates service against a fake Nix that makes and moves generation links:
update, go back, Xwayland moving with the apps, a failed rebuild undone, a
second move keeping two pins, an image pin winning, Free space ending Go
back). Core: tsc, eslint, vitest for settings (32). Dev container: Check
against the real channel found `nixos-26.05.13627.c56a87d8e41c` and listed
firefox 159.0 → 159.0.1 with two apps rebuilt; the Linux apps pane still
searched the image's pin.

**Skipped.** The live Update, Go back and a second move: the agent's auto
mode refused pressing Update on the dev volume, since it unlinks
generations and runs `nix store gc`. They are the owner's walk (board
ticket). A third distinct pin was only exercised in the jest test. The full
cross-workspace test run. No host change, so no `cargo test`.

**Left on the dev volume:** the 13627 list, its compact index and
`pins.json` with the update on offer (ready for the owner's walk), and,
from a probe of `nix profile upgrade`, the nixpkgs source at `c56a87d8` and
`hello` in the store, unrooted, which Free space or the first Update's gc
removes.
