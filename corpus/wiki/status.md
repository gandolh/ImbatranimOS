---
summary: Dated snapshot (2026-11-03) of imbatranimOS, per area — identity is the machine's own single-owner sign-in (Ward dropped 2026-10-07), the desktop shell and its keyboard focus (fixed 2026-10-27/28), the add-ons and the system-handle seam, the Marketplace (URL installs, suites, kit apps) and the office apps moved to imbatranim-office (2026-10-28), the proxied Browser, the docs site; the two themes, Apricot by default and Classic (built 2026-11-03, not deployed); six open briefs: the Linux apps layer 01-06, in a cloud session on its own branch; the theme follow-ups 16-21 are done; what the owner owes, open todos, and where the history lives.
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
  leaves it in front (2026-10-27 to 2026-10-28).
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

01-06 are the Linux apps layer, in build order: Nix in the image with Firefox
headless, the Wayland host showing a window, input and title bars, popups and
Firefox in a window, the Linux apps pane, lifecycle and sleep
([decisions-linux-apps.md](decisions-linux-apps.md)). A Claude cloud session
is building them on the branch `claude/linux-apps-layer` (pull request #1 on
origin), not on `main`. Merging it will conflict on the version bump,
`log.md` and this page.

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
The server ISO is deferred by the owner (2026-10-04).

## Owed by the owner

- Push imbatranim-office's `main` (to `aa626c2` or later), then this repo,
  then deploy the two themes (briefs 08-21) with vps-deploy
  (`node cli.ts imbatranim-os all`). The Office catalog entry pins
  `aa626c2`, which only exists locally until the push. The office kit is
  synced and the pin moved (2026-11-03). Hollow needs nothing: it doesn't use
  the kit.
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

- [files-background-menu-misses-empty-space](../todos/files-background-menu-misses-empty-space.md)
- [full-run-timeouts-under-load](../todos/full-run-timeouts-under-load.md)
- [keyboard-gaps-left-after-the-focus-fixes](../todos/keyboard-gaps-left-after-the-focus-fixes.md)
- [linux-apps-after-the-first-wave](../todos/linux-apps-after-the-first-wave.md)
- [native-build-leftovers-in-the-image](../todos/native-build-leftovers-in-the-image.md)
- [tray-crash-on-a-wrong-api-base](../todos/tray-crash-on-a-wrong-api-base.md)

## History

The first forty-six pieces of work, one line each:
[build-record-2026-07.md](build-record-2026-07.md). The narrative to
2026-08-06: [status-history.md](status-history.md). The sweeps after it:
[backlog-2026-07-31.md](backlog-2026-07-31.md),
[feature-exploration-2026-08-06.md](feature-exploration-2026-08-06.md),
[backlog-2026-08-07.md](backlog-2026-08-07.md). Everything since:
[log.md](../log.md).
