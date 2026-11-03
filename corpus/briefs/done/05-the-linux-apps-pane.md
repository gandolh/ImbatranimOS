# Brief 05 — The Linux apps pane

## Context

The owner chose (2026-10-23) a graphical way to install Linux apps from day
one, not just `nix profile install` in the Terminal
([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md) has the Nix
calls). Installed apps appear in the Start menu by themselves, read from the
`.desktop` files every Linux app ships. Unfree packages are allowed and
marked. Run this after 04.

`nix search` evaluates all of nixpkgs: minutes and gigabytes of RAM on first
use, which is wrong for a 2 GiB VPS. Each NixOS release instead publishes its
whole package list as one file, `packages.json.br`. `nixos-26.05`'s was
9.8 MB on 2026-10-23. The pane searches that file locally.

## Spec

1. **The package index.**
   - Read `packages.json.br` and `git-revision` from
     `/usr/share/imbatranim/nix/`, where 01's image build bakes them from the
     pinned snapshot (owner, 2026-11-03: no download for the index).
   - The commit must equal the pin in `/etc/nix/nixpkgs-pin.env`. If it
     differs, show that, and offer no installs until they match.
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
     clicking tab's session (`WAYLAND_DISPLAY` and the 01 environment), in its
     own process group (06 relies on that).
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

## Outcome (2026-11-03)

Built in `457db5d` on `claude/linux-apps-layer` (1.83.0) and walked in the
dev container in headless Chromium, 12 checks passing.

**The index.** The baked `packages.json.br` is 381 MB of JSON unpacked,
and `JSON.parse` of it costs about 1.6 GB, more than the VPS has. So it is
streamed: brotli-decompressed in chunks, each package's object cut out by
depth (strings skipped) and parsed alone, and only what the pane shows is
kept: 129,833 packages (x86_64-linux, and not marked unavailable unless
unfree, since the list was made without allowing unfree ones), 11.7 MB on
the `/nix` volume as `index-<commit>.json`. Built in 7.2 s at a peak RSS of
174 MB, once per pin; loaded again in 0.17 s; dropped from memory after 15
minutes without a search. The pane says when the list's commit differs from
the pin and installs nothing then.

**Search** matches every word in the attribute, the name or the
description: exact names first, then prefixes, then other name matches,
then descriptions; 50 at most. Each result has its version, description,
attribute and an Unfree badge.

**Jobs.** `nix profile add nixpkgs#<attr>` (with `--impure` for an unfree
one, which `NIXPKGS_ALLOW_UNFREE=1` then allows), `nix profile remove
<name>` and `nix-collect-garbage -d`, each with `spawn` and an argument
array, in its own process group (a 30-minute limit stops the group), one at
a time; the attribute must be in the index and plain (`isValidAttr`), the
name in `nix profile list --json`. The pane polls the job's log every
second while it runs, as the marketplace pane does.

**Only from the tab that holds the session** (owner, 2026-11-03). Installs,
removals, Free space and launches carry the tab's desktop session id, and
the backend refuses them unless that session's `/api/wayland` socket is
live (`WaylandGateway.hasSession`): the tab the apps will show in. Reading
(status, search, installed, the job, the store) needs only the sign-in.

**Start entries.** The profile's `share/applications/*.desktop`
(`Type=Application`, not `NoDisplay` or `Hidden`; the profile is
`$NIX_STATE_HOME/profile` since 01, not `~/.nix-profile`) become
`linux:<id>` entries spliced into `APP_REGISTRY` the way marketplace apps
are, at sign-in and after every job. Start, the palette, the desktop, pins
and Settings → Apps treat them as apps; opening one posts a launch instead
of opening a window. The launch runs `Exec` with its field codes removed and
its quoting split per the spec, detached in its own process group, with the
Terminal's environment and the session's `WAYLAND_DISPLAY`; the backend
records the group per session for 06. A Linux window's app id is the same
`linux:<id>`, so its taskbar button and the desktop now show the entry's
icon (02 left them without one). Icons come from the profile's hicolor
theme (largest PNG, or the SVG) or a store path, served with a
`sandbox` policy so an SVG opened by its URL runs nothing.

The walk: the pane is in Settings next to Marketplace; Firefox (from 01's
proof) was in Start; removing it ran a job and took it out of Start;
searching "firefox" listed it; installing streamed the log and finished,
Firefox was in Start again and launched from the Start menu into an OS
window titled by Firefox, its taskbar button showing its icon; "gimp"
listed GIMP; `vscode` carried the Unfree badge; a made-up attribute posted
to the install endpoint got 400 with no Nix process started and the last
job unchanged; Free space took the store from 2.1 GB to 1.6 GB (the
nixpkgs source and Firefox's earlier copy went).

**Departures from "files you own"**, each the smallest hook: `openApp` and
the palette's app source (which opens windows itself) launch a Linux entry;
`shared/registry/marketplace.tsx` exports `noteRegistryChanged` so Start
re-renders; the Wayland module exports its gateway and `hasSession`; the
app module registers the new module.

Not done: localized names (`Name[ro]`), desktop actions (New Window), and
`TryExec`. A command-line tool installs and works in the Terminal but gets
no Start entry, as specced.

Checks: `npm run typecheck` (26) and `npm run lint` (25), core's tests (586
in 46 files, 2 new), the backend's unit tests (847 in 53 suites, 17 new) and
e2e suite (183 of 184 in the full run; the marketplace's service-app test
timed out under load, the open todo, and passed with its file alone, 9 of
9).
