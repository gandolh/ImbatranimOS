---
summary: Dated snapshot (2026-11-03) of imbatranimOS, per area — identity is the machine's own single-owner sign-in (Ward dropped 2026-10-07), the desktop shell and its keyboard focus (fixed 2026-10-27/28), the add-ons and the system-handle seam, the Marketplace (URL installs, suites, kit apps) and the office apps moved to imbatranim-office (2026-10-28), the proxied Browser, the docs site; the two themes, Apricot by default and Classic (built 2026-11-03, not deployed); the Linux apps layer (briefs 01-06, built on its own branch and merged 2026-11-03, not deployed); open briefs 22-36 (the dev image, five fixes, two kit changes for imbatranim-office, a turbo cap, six Linux apps follow-ups); the theme follow-ups 16-21 are done; what the owner owes, open todos, and where the history lives.
updated: 2026-11-03
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
- 16 (done): a Monaco theme from the tokens, with Diff following the OS mode;
- 17 (done): rounded, inset list rows in Apricot, File Manager's included;
- 18 (done): warm shadows for toasts, tooltips, the tray and sign-in;
- 19 (done): rounded boxes inside windows;
- 20 (done): the accent focus ring on every control;
- 21 (done): Settings fits a phone.
22 (done 2026-11-03, on this run's branch) makes the dev image survive a
version bump: `npm ci` runs on version-free manifests, the dev stage no
longer re-owns `node_modules`, and `npm run dev` (`scripts/dev.mjs`) has
Compose watch version-free copies. A version-only rebuild went from 4 min
31 s to 4 s.

23-36 were written on 2026-11-03 from the open todos, in an estate-wide grill
with the owner. A run on branch `claude/tender-franklin-h8lc35` (one PR, not
merged) builds them in number order; done there so far: 23 (the Linux apps
pane rounds in Apricot; a Linux window's surface keeps no ring), 24 (the tray
and Sticky Notes' desktop layer read a wrong answer as nothing), 25 (Files'
listing fills its pane, so its menu reaches below the rows), 26 (`openApp`
gives a window it raises the keyboard; the per-caller wrappers are gone), 27
(the strip keeps only each native module's binary; a source build no longer
grows the image), 28 (`startIn` on `pickOpen`/`pickSave`, kit 1.1.0, ready
for imbatranim-office's Save as brief), 30 (`npm test` caps turbo at half the
cores; built before 29, which was larger), 29 (`system.server.request()`,
kit 1.2.0: a kit app's server starts when the app asks, not when its window
opens). As written:
- 23-27, small fixes: the Linux apps pane in the themes (no accent ring on a
  Linux window's surface), the tray surviving a wrong stats answer, Files'
  background menu below a short listing, `openApp` moving the keyboard into a
  raised window, and the image's size after a source build;
- 28 and 29, for imbatranim-office: the file dialogs' `startIn`, and a kit
  app asking for its server on demand
  ([decisions-marketplace-suites.md](decisions-marketplace-suites.md));
  imbatranim-office's own briefs then use them;
- 30: the full test run caps turbo at half the cores;
- 31-36, Linux apps after the first wave: XWayland, a keyboard layout,
  HiDPI, window places after a reload, localized desktop entries with their
  actions, and lossy video regions.
The server ISO is deferred by the owner (2026-10-04).

## Owed by the owner

- Push imbatranim-office's `main` (to `aa626c2` or later), then this repo,
  then deploy the two themes (briefs 08-21) and the Linux apps layer (01-06)
  together with vps-deploy
  (`node cli.ts imbatranim-os all`). The README images are already retaken
  in Apricot light (2026-11-03). The Office catalog entry pins
  `aa626c2`, which only exists locally until the push. The office kit is
  synced and the pin moved (2026-11-03). Hollow needs nothing: it doesn't use
  the kit.
- Linux apps, in Chrome on the dev container: open an app beside Firefox
  playing a video, a few times. Chromium crashed there before the fade-only
  change and still did once in five (brief 04's outcome); Chrome with a GPU
  may not at all. Also look at a Linux window on a screen with
  `devicePixelRatio` above 1 (soft, known).
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

Four Linux apps items each need a grill with the owner before a brief, and
one waits on the owner's check:
- [linux-apps-sound](../todos/linux-apps-sound.md)
- [linux-apps-clipboard](../todos/linux-apps-clipboard.md)
- [linux-apps-on-the-vps](../todos/linux-apps-on-the-vps.md)
- [linux-apps-move-the-nix-pin](../todos/linux-apps-move-the-nix-pin.md)
- [window-zoom-beside-linux-windows](../todos/window-zoom-beside-linux-windows.md)
  (Chrome with a real GPU)

## History

The first forty-six pieces of work, one line each:
[build-record-2026-07.md](build-record-2026-07.md). The narrative to
2026-08-06: [status-history.md](status-history.md). The sweeps after it:
[backlog-2026-07-31.md](backlog-2026-07-31.md),
[feature-exploration-2026-08-06.md](feature-exploration-2026-08-06.md),
[backlog-2026-08-07.md](backlog-2026-08-07.md). Everything since:
[log.md](../log.md).
