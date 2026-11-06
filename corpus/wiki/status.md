---
summary: Dated snapshot (2026-11-06) of imbatranimOS, per area — identity is the machine's own single-owner sign-in (Ward dropped 2026-10-07), the desktop shell and its keyboard focus (fixed 2026-10-27/28), the add-ons and the system-handle seam, the Marketplace (URL installs, suites, kit apps) and the office apps moved to imbatranim-office (2026-10-28), the proxied Browser, the docs site; the two themes, Apricot by default and Classic (built 2026-11-03, not deployed); the Linux apps layer (briefs 01-06, built on its own branch and merged 2026-11-03, not deployed); briefs 22-30 and 32 and 34-36 built 2026-11-03/04 on branch claude/tender-franklin-h8lc35 (PR 2, merged: the dev image, five fixes, startIn and on-demand servers for kit apps (kit 1.2.0), a turbo cap, four Linux apps follow-ups); 33 done 2026-11-06 (Linux windows sharp on HiDPI screens, ready for deploy; the scale capped at 2 the same day); 39 done 2026-11-06 (Linux apps' sound in the tab, the host as each session's sound server, ready for deploy); 40 done 2026-11-06 (a tray volume and mute over all sound, kit 1.3.0, ready for deploy); 31 done 2026-11-05 (X11 apps through Xwayland, which comes with the first app that speaks X11); the theme follow-ups 16-21 are done; briefs 37-44 written 2026-11-04 from the last open todos, 37, 38, 41, 42 and 44 done 2026-11-05 (production's own Compose profile; a crashed desktop layer hides itself; plain-text copy and paste with Linux apps; a session bus with notifications; the VPS cap's numbers and Linux apps first under it); what the owner owes and where the history lives.
updated: 2026-11-06
---

# Status — 2026-11-03

**The web OS is built and in daily use.** One container is the computer: Alpine
and Node, the desktop and the API on one port, everything as the unprivileged
`imbatranim` user, home in a named volume ([architecture.md](architecture.md)).
`origin/main` is at `4ac70e3`; the local commits after it (`621c4dd` and the
briefs reset) are not pushed. The reset commit is version 1.67.0. Brief numbering
restarted at 01 on 2026-11-02 (see [log.md](../log.md), "Briefs reset").

## By area

- **Identity** (2026-10-07). One sign-in, the machine's own, everywhere: a
  single owner claims the machine on first visit, gated by `SETUP_TOKEN` where
  it is set (the deploy requires one); scrypt hashes, an `imb_session` cookie
  whose hash is stored, per-address backoff; a restore ends every session.
  Ward's module, variables and token refresh are gone. The cover screen hides
  the desktop and is not a lock. Shared-origin risk accepted: a script on a
  sibling app can send requests the browser signs with `imb_session`
  ([decisions-estate-era.md](decisions-estate-era.md)).
- **The shell.** A Windows-7-classic layout in two themes (2026-11-03,
  [decisions-themes.md](decisions-themes.md)): Apricot, the default (cream,
  pastel accents, soft corners, Figtree, a sunset-hills wallpaper), and Classic
  (flat black and white with crimson, square, Space Grotesk), each light or
  dark, picked in Settings → Appearance (built in briefs 08-15, not yet
  deployed). Workspaces, startup apps, default apps and Open with,
  notifications, the palette and global search
  ([ui-conventions.md](ui-conventions.md)). Keyboard focus follows the
  window the owner raised or opened, from the taskbar, Alt+Tab (also over a
  Terminal), Start or the palette, and a click that opens another window
  leaves it in front (2026-10-27 to 2026-10-28); since 2026-11-03 `openApp`
  itself gives a window it raises the keyboard, whoever called it.
- **Add-ons and the seam** (2026-08-06). Each app gets an injected `system`
  handle and imports nothing from core; per-window error boundaries; an
  ephemeral session with durable dotfiles ([os-layering.md](os-layering.md)).
- **The Marketplace** (2026-10-06 to 2026-10-27). The in-repo catalog installs
  apps from other repos at pinned commits; any public GitHub repo with an
  `imbatranim.json` installs as a sandboxed app after consent; one catalog entry
  can install several apps; kit apps render in the desktop's own tree with the
  shared UI kit, refuse plainly, rebuild at the same ref, start loading when
  their window opens, and open at sign-in when they are startup apps
  ([decisions-marketplace.md](decisions-marketplace.md),
  [decisions-marketplace-suites.md](decisions-marketplace-suites.md)).
- **Office** (2026-10-28). The built-in Docs, Slides, Sheets, PDF Viewer and
  norPDF are retired for imbatranim-office's apps through the Marketplace
  (pinned at `909c321`); an office file with Office not installed says where to
  get it ([decisions-office-suite.md](decisions-office-suite.md)).
- **The Browser** (2026-10-04). On its own proxy origin, security-reviewed.
- **Docs site** (2026-10-19). Docusaurus with the same base and URLs, light
  only, local search.
- **Deploy.** `vps-deploy` redeployed it on 2026-10-07 with `SETUP_TOKEN`
  required; the move to its own host (code 2026-10-22) has no recorded deploy.

## Open briefs

01-06, the Linux apps layer, are done: Nix in the image with Firefox
headless, the Wayland host showing a window, input and title bars, popups and
Firefox in a window, the Linux apps pane, lifecycle and sleep
([decisions-linux-apps.md](decisions-linux-apps.md)). Their branch is
`claude/linux-apps-layer` (2026-11-02, PR 1). 01 is done (2026-11-03): proven
in the prod image and the dev container, pinned at
`nixos-26.05.13446.7dcdd87373d7` (`7dcdd873`). The image is self-contained
(base profile and package index baked in; boot never downloads) and grows
from 393 MB to 488 MB; Firefox is a 446 MiB download and 1.4 GiB in `/nix`.
Nix state lives in `/nix`, not the home, so backups keep restoring. 02 is
done: the Wayland host shows a Linux app's window in an OS window, one
socket per tab, frames as lossless WebP. 03 is done: pointer, US keyboard,
focus, resize and close, and title bars that follow the app (the Win7 bar on
request, else a frame). Both were walked again in the dev container on
2026-11-03 with foot and gtk3-demo, 19 checks passing. 04 is done: popups
and subsurfaces, and Firefox in an OS window, walked in the dev container
(menus, tabs, a download, a video; PSS about 500 MB idle, 160 kB/s
scrolling). While a Linux window is open, windows open with the fade only:
Chromium's renderer crashed when a zoom ran beside one. 05 is done:
Settings → Linux apps searches the release's list (streamed into a 12 MB
index), installs and removes from the tab that holds the session, and frees
space; installed apps appear in Start and launch into the tab. 06 is done:
an app lives with its tab (a reload within 30 s finds it, closing the tab
stops it), sleeps under the cover screen, and goes quiet when hidden or
minimized; tini is PID 1. The owner merged the branch into `main` on 2026-11-03 (PR 1, `0cba6ab`), and this repo's `main` merged it after the theme briefs. The
grill of 2026-11-03 settled what it left open
([decisions-linux-apps-built.md](decisions-linux-apps-built.md)).

08-15, the two themes, were built 2026-11-03 on `main` (1.70.0 to 1.86.0)
and deploy together; each brief's outcome is in `briefs/done/`, and 15's lists
the owner's steps and six design questions. 07 (research) is superseded by
the grill.

16-21, all done 2026-11-03, are the owner's answers to those questions (grilled 2026-11-03,
[decisions-themes.md](decisions-themes.md)), run one at a time on `main` and
deployed with 08-15:
a Monaco theme from the tokens (16), rounded inset list rows in Apricot (17),
warm shadows (18), rounded boxes inside windows (19), the accent focus ring
(20), and Settings on a phone (21).
22 (done 2026-11-03, on this run's branch) makes the dev image survive a
version bump: `npm ci` runs on version-free manifests, the dev stage no
longer re-owns `node_modules`, and `npm run dev` (`scripts/dev.mjs`) has
Compose watch version-free copies. A version-only rebuild went from 4 min
31 s to 4 s.

23-36 were written on 2026-11-03 from the open todos, in an estate-wide grill
with the owner. A run on branch `claude/tender-franklin-h8lc35` (PR 2, merged
into `main`) built thirteen of them, with 22, on 2026-11-03 and 2026-11-04; each
outcome is in `briefs/done/`. 23-27 are small fixes (the Linux apps pane
in Apricot, the tray and Sticky Notes reading a wrong answer as nothing,
Files' listing, `openApp` giving the keyboard, the native-module strip); 28
and 29 give imbatranim-office `startIn` (kit 1.1.0) and
`system.server.request()` (kit 1.2.0); 30 caps turbo at half the cores; 32,
34, 35 and 36 are Linux apps follow-ups (a US or Romanian layout, window
places kept across a reload, Start entries in the browser's language, video
regions as JPEG).

31 is done (2026-11-05, `e365ca8`): X11 apps open through Xwayland, on a
session's first X client, installed with the first app that speaks X11
([decisions-linux-apps-built.md](decisions-linux-apps-built.md)). 33 is done
(2026-11-06, `26dc24e`, ready for deploy): Linux windows draw at the screen's
pixels (scale: the ratio's ceiling); X11 apps stay at 1. The owner capped the
scale at 2 the same day (`031b56b`, ships with 33): a phone at a ratio of
about 3 draws at 2, a little soft, under the VPS's memory cap.

37-44 were written 2026-11-04 from a grill with the owner. Done on
2026-11-05 (each outcome in `briefs/done/`): 37 production's own Compose
profile; 38 a crashed desktop layer hides itself and says so; 41 plain-text
copy and paste with Linux apps (the selection now follows the keyboard); 42
a D-Bus session bus per session, so Firefox keeps one instance, and Linux
apps' notifications in the OS; 44 the VPS cap's numbers (1 GiB / 1 CPU in
`infrastructure/README.md`), Linux apps first when memory runs out, and a
notice when one is killed. 39 is done (2026-11-06, `4acbf07`, ready for
deploy): Linux apps' sound plays in the tab. The Wayland host is each
session's PulseAudio-protocol server (no sound daemon in the image,
[decisions-linux-apps-built.md](decisions-linux-apps-built.md)) and sends the
mix as Opus; the first press or key starts it. 40 is done (2026-11-06,
`d3da0e7`, ready for deploy): a tray volume and mute over both sounds, a
dotfile, read by apps as `system.sound` (kit 1.3.0). Not built: 43 Updates.
The server ISO is deferred by the owner (2026-10-04).

## Owed by the owner

- Push imbatranim-office's `main` (to `1b4394f` or later), then this repo,
  then deploy the two themes (briefs 08-21) and the Linux apps layer (01-06)
  together with vps-deploy
  (`node cli.ts imbatranim-os all`). The README images are already retaken
  in Apricot light (2026-11-03). The Office catalog entry pins
  `1b4394f` (2026-11-05: Save as in the file's folder, the suite a `service`
  whose server only CAD starts on its first DWG, Sheets' save waiting for the
  first calculation), which only exists locally until the push. The office
  kit is synced to this repo's `3dd0a8d`. Hollow needs nothing: it doesn't
  use the kit.
- Linux apps, in Chrome on the dev container: open an app beside Firefox
  playing a video, a few times. Chromium crashed there before the fade-only
  change and once in five after (brief 04); Chrome with a GPU may not at all.
- After brief 33's deploy: a Linux app on a screen whose `devicePixelRatio`
  is above 1 is sharp and follows a page zoom (at most scale 2: on a phone
  near ratio 3 it is a little soft, by choice).
- After briefs 39 and 40's deploy, in a normal Chrome and on the Android
  phone: a video in Firefox is heard after one click in the desktop, sound
  and picture together; the tray's slider and mute move it and the media
  player alike, and a reload keeps them (the walks had no real speakers).
- Before Linux apps go on at the VPS: set the cap from
  `infrastructure/README.md` ("the container cap": `mem_limit: 1g`,
  `memswap_limit: 1g`, `cpus: 1.0`) in vps-deploy's `imbatranim-os` stack
  (brief 44; vps-deploy's brief 16, written 2026-11-05, not built).
- Copy and paste with Linux apps (brief 41), in a normal Chrome on the dev
  container: copy text in Firefox and paste it into Notepad and into a page
  outside the OS; copy text outside and Ctrl+V it into Firefox (Chrome asks
  for clipboard permission once). The headless walk could only use a stand-in
  clipboard.
- Linux apps, in Chrome on the dev container: a hidden tab carrying no
  frames (the walk could only simulate hiding), and the keys the browser
  keeps (brief 03's list).
- Delete the old local development database at `data/db.sqlite` in the repo
  root (gitignored): it is from before the Ward move and still holds the old
  password hash. Delete any old downloaded `imbatranim-home-*.tar.gz` backups
  too (start fresh, decisions-estate-era.md).
- After the deploy that dropped Ward: claim the machine at the OS's address
  with the `SETUP_TOKEN` from vps-deploy's `secrets/imbatranim-os.env` and a new
  password, then remove the `imbatranim-os` app from Ward's console, which also
  drops its grants and service keys. `WARD_APP_KEY` in that secrets file is
  unused.
- Human checks left on the Browser: search past a CAPTCHA, audio, and a real
  site sign-in across a reload.

## Open todos

None. On 2026-11-06 the owner promoted the last two: brief 48 (X11 apps
share the clipboard and show their own cursors) and brief 49 (a click on a
Linux app's notification runs its action).

On 2026-11-04 the owner's grill turned the earlier todos into briefs 37-44
and dropped the window-zoom check.

## History

The first forty-six pieces of work, one line each:
[build-record-2026-07.md](build-record-2026-07.md). The narrative to
2026-08-06: [status-history.md](status-history.md). The sweeps after it:
[backlog-2026-07-31.md](backlog-2026-07-31.md),
[feature-exploration-2026-08-06.md](feature-exploration-2026-08-06.md),
[backlog-2026-08-07.md](backlog-2026-08-07.md). Everything since:
[log.md](../log.md).
