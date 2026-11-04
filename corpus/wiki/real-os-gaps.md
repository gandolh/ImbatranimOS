---
summary: Where the OS still stops feeling like an OS (2026-07-31 research) — the three places the illusion breaks first, the Tier-2 features worth doing later, and the standing rejection list (root-requiring features, a package manager, a services view, man pages, printing, a clipboard manager, screen recording, an SSH app) with the reason each is out, so they are not re-litigated. The global mixer was reversed on 2026-11-04 once Linux apps brought a second sound source.
updated: 2026-11-04
---

# Real-OS gaps — what is missing, and what we refuse

Research pass, 2026-07-31: *"what can we do to mimic a real OS more?"* The
buildable answers became the work of 2026-07-31 (see
[backlog-2026-07-31.md](backlog-2026-07-31.md)). This page keeps the parts that
are **not** briefs: the honest verdict, the deferred tier, and — most usefully —
the rejections and why, so the next session does not re-argue them.

## The honest verdict

It already is an OS where it counts: a real PTY, a real jailed filesystem with
symlink-proof `resolveSafe`, real `/proc` memory and statfs, ownership-scoped
`kill`, argon2id + TOTP auth (as of 2026-07-31; replaced by Ward and the
local sign-in since), and a composition root that behaves like a package
system. **24 apps is a wider roster than a stock Alpine desktop.** So the gap was
never "more apps" — it is the layer *underneath* them.

Where the illusion breaks first, for a new user:

1. **Delete is forever.** No bin, no undo (2026-07-31).
2. **Double-click does nothing** for any unmapped file type — `.csv`, `.env`,
   `Dockerfile`, anything extensionless. A dead double-click reads as broken
   (2026-08-06).
3. **The OS cannot tell you about itself.** "About this machine" was three
   hardcoded strings; there is no disk breakdown, no log, no sign-in history,
   and the only backup is a host shell command (the settings password, backup and restore, the disk-full work and the system log).

## Tier 2 — worth doing later, not yet briefed

1. **Paint / image editor** — the strongest missing *app category*. Lift the
   snipping tool's annotation layer and undo. Lost Tier 1 only because
   annotate-a-screenshot is already covered and image editing is a want, not a
   data-safety net.
2. **OS-wide Recent Files** — recents exist for Notepad only (`/notes/recent`).
   Promote to a service every opener records into; feeds the shared file open dialog work's picker and a
   Start-menu Recent list.
3. **Scheduled tasks** — feasible unprivileged: `crond -c ~/.imbatranim/cron`
   from `entrypoint.sh` (busybox has both applets; the system spool is
   root-owned, a home spool is not). Only earns its keep once backup and restore (2026-08-06) exists —
   "nightly backup" is the use case.
4. **Auto-lock after idle** — Lock exists in the Start menu but nothing ever
   locks by itself. Real value for the VPS deployment in the v1 release work (2026-10-07).
5. **A core scheduler for alarms/reminders** — Clock, Calendar and Todo all fire
   only while their app is open, and all three currently have to apologise for
   it in the UI (the clock, calendar and todo work of 2026-08-05). The honest fix is one OS-level scheduler.
   Options to grill: desktop-lifetime (fixes the common case, still dies with
   the tab) vs a Service Worker with Notifications (true background, but the OS
   has no service worker until the proxied browser (2026-10-04) introduces one).
6. **Sound recorder** — `MediaRecorder` → `~/Audio`. Needs HTTPS + mic
   permission. Genuinely a "real OS ships this" utility.
7. **Diff / compare tool** — Monaco's `DiffEditor` is already in the bundle via
   the code editor; real value next to Git.
8. **Hex viewer** — fills the unmapped-binary hole default apps and Open with's always-resolve rule
   exposes.

## Rejected, with the reason — do not re-litigate

- **Anything requiring root**: mounting disks, partitions, fstab, firewall,
  users and groups, sysctl, installing apk packages. The container is
  unprivileged and the user has no sudo, by design. Out permanently, not
  "later".
- **A runtime package manager for desktop apps** — kill-list; `manifest.ts` *is*
  the package system. A package format only earns its cost when apps come from
  outside the repo. (Since the marketplace install (2026-10-06), apps from other repos install from the
  in-repo marketplace catalog; built-in add-ons are still `manifest.ts`.)
  Linux apps install at runtime with Nix since 2026-10-23:
  [decisions-linux-apps.md](decisions-linux-apps.md).
- **A "Services" / systemd view** — there is no init: `entrypoint.sh:14` execs
  node as PID 1, so it would list one row. Authentic-shaped, zero value, and
  adding a supervisor to make it interesting brushes the killed daemon.
- **A man-page reader** — the prod stage installs no apk packages, Alpine strips
  docs, and busybox has no `man`. It would need mandoc + man-pages (~10-25 MB)
  to then document GNU flags the busybox userland does not have. Lightweight
  loses *and* accuracy loses. `--help` in the Terminal wins.
- ~~**A global volume / mute / mixer**~~ — rejected 2026-07-31 while the media
  player's `<audio>` was the only sound. **Reversed 2026-11-04**: Linux apps'
  sound is a second source, and the tray gets one volume and a mute over both
  ([decisions-linux-apps-built.md](decisions-linux-apps-built.md)).
- **Printing via a spooler** — CUPS is a daemon plus drivers plus privileged
  setup. The meaningful 5% is "Print to PDF" per app, which belongs in the app
  briefs.
- **A clipboard manager with history** — the browser gives no readable clipboard
  without a per-read user gesture and permission; polling is impossible and
  hostile. Cross-app copy is already the file manager's own.
- **A screen recorder** — `getDisplayMedia` records the *host* screen or tab, not
  the container; recording your own browser from inside it inverts "the tab is
  the display".
- **An SSH client app** — the Terminal is a real PTY. This is `apk add
  openssh-client` (~1.2 MB) plus typing `ssh`; a GUI wrapper adds nothing.
- **A grep / text-search app** — already shipped: `/api/files/search?content=1`
  is a real bounded content grep, wired into the palette (2026-07-18).
- **Character map, colour picker, font viewer, offline dictionary** — no font
  management exists (browser fonts are fixed), no design workflow to serve, and
  a dictionary is multi-MB for a party trick.
- **Env-var / mounts / `/proc` browser apps** — one Terminal command each, for an
  audience that has the Terminal. If any deserves a GUI it is a System Monitor
  tab (2026-08-04), not an app.
- **Session reattach / tmux-style detach** — the ephemeral-session work (2026-08-06) defers it explicitly; a
  server-side session store is the shape of the killed daemon.
- **A task manager that kills hung desktop apps** — windows are not processes.
  Per-window error boundaries's error boundaries are the honest version.
- **Timezone / locale settings** — the browser already formats in the user's real
  timezone and the container needs no tzdata. Nothing is broken.
- **External calendar sync (CalDAV/Google), bookmark sync, remote backup
  destinations** — all mean stored credentials and outbound egress for a
  single-user local OS. File-based interop (ICS, Netscape HTML, tar.gz) is the
  answer instead.
