# Brief 172 — The Linux apps pane

## Context

The owner chose (2026-10-23) a graphical way to install Linux apps from day
one, not just `nix profile install` in the Terminal
([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md) has the Nix
calls). Installed apps appear in the Start menu by themselves, read from the
`.desktop` files every Linux app ships. Unfree packages are allowed and
marked. Run this after 171.

`nix search` evaluates all of nixpkgs: minutes and gigabytes of RAM on first
use, which is wrong for a 2 GiB VPS. Each NixOS release instead publishes its
whole package list as one file, `packages.json.br`. `nixos-26.05`'s was
9.8 MB on 2026-10-23. The pane searches that file locally.

## Spec

1. **The package index.**
   - Download `packages.json.br` and `git-revision` from the same release
     snapshot. Follow `channels.nixos.org/<release>`'s redirect once and use
     the resolved directory for both files, so the list matches what installs.
   - The release and commit must equal the pin in `infrastructure/nix/`
     from 168. If they differ, show that, and offer no installs until they
     match.
   - Decompress with Node's built-in brotli and keep a compact index on the
     `/nix` volume (not in home, so Backup skips it).
   - Only `x86_64-linux` packages.
2. **Search.**
   - An authenticated endpoint matching attribute name, `pname` and
     description, capped (for example 50 results), each with its version,
     description and an unfree flag.
   - CLI tools are included; they land on the Terminal's `PATH`.
3. **Install and remove.**
   - Run `nix profile install nixpkgs#<attr>` and `nix profile remove` with
     `execFile` and an argument array, never a shell string.
   - `<attr>` must exist in the index before anything runs; the package name
     is user input.
   - One job at a time, with its log streamed to the pane the way marketplace
     installs stream theirs.
   - The installed list comes from `nix profile list --json`.
4. **Disk.**
   - Show the store's size.
   - A **Free space** button runs `nix-collect-garbage -d`. It deletes old
     profile generations, so rollback history is lost; the button says so
     before it runs.
5. **Start menu entries.**
   - After every install or remove, and at startup, scan
     `~/.nix-profile/share/applications/*.desktop`. Take
     `Type=Application`, skip `NoDisplay=true` and `Hidden=true`.
   - Each becomes a Start entry with its `Name` and its icon, resolved from
     the profile's `share/icons` (hicolor PNG or SVG, the largest available)
     and served by an authenticated route.
   - Launching runs `Exec` with its field codes (`%u`, `%f` and the rest)
     removed and the argv split per the desktop-entry spec. It runs in the
     clicking tab's session (`WAYLAND_DISPLAY` and the 168 environment), in its
     own process group (173 relies on that).
   - These entries are Linux app launchers, not add-ons. They can be pinned
     and searched in the palette like any app. Disabling one in Settings →
     Apps works as for any app.
6. **The pane.** A **Linux apps** section in Settings, next to Marketplace,
   built from `@imbatranim/ui`. It has:
   - search with results;
   - an installed list with Remove;
   - the job log;
   - the store size and Free space.

   Results show an unfree badge. Use plain, familiar wording; the owner
   prefers conventional UI over metaphor.

## Must preserve

- Marketplace installs and their pane.
- Settings → Apps enable and disable for every existing app.
- Start, the palette and the taskbar for every existing app.
- No route without sign-in; `execFile` only.

## Acceptance

In Chrome on the dev container:

- searching "firefox" lists Firefox; installing it streams a log, then
  Firefox appears in Start and launches into an OS window;
- removing it takes it out of Start;
- searching "gimp" lists GIMP, with no install needed;
- an unfree result (for example `vscode`) carries the badge;
- a made-up attribute sent to the install endpoint directly is refused
  without running anything;
- Free space reduces the store size shown.

Unit tests cover the `.desktop` parser (field codes, quoting, `NoDisplay`) and
the attribute check. All suites pass.

## Files you OWN

- `apps/backend/src/modules/linux-apps/**` (new)
- `apps/core/src/modules/settings/` (the new section and its registration
  only)
- `apps/core/src/modules/linux-windows/**` (launchers)
- The smallest hooks needed in the Start menu and palette to list launchers

## Files you must NOT touch

- `infrastructure/nix/**` (read the pin; never write it).
- The marketplace backend and its pane.
