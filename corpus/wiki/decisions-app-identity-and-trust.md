---
summary: Locked calls from the 2026-11-06 imbatranim-apps grill on how apps are trusted and kept apart, shaped by Unix, Windows, Android and macOS practice (research-unix-and-windows-conventions.md). Apps run as their own identity with Unix modes on their files (rwx for owner, group, others; a private group per app plus its install group; private by default), kept and enforced by the OS since the container has one Linux user. Installable apps keep data in XDG-style folders per kind and see other files only by grant (opened through the OS or picked). URL apps run natively once trusted, which revisits 2026-10-07: verified ones come from a verified.json in imbatranim-apps pinned per OS release, the rest need the owner's trust each version. WASM threads are on (COOP/COEP).
updated: 2026-11-09
---

# Decisions: app identity and trust (2026-11-06)

Settled with the owner in the imbatranim-apps grill on 2026-11-06, then
checked against how Unix, Windows, Android and macOS do the same things
([research-unix-and-windows-conventions.md](research-unix-and-windows-conventions.md)).
The work is in the todos named below. Changing one of these needs an
explicit revisit and a `log.md` entry.

## Apps run as their own identity, and files carry Unix modes

Each running app has an identity: its app id acts as a user, and each
running copy has an instance id that acts as a pid. Every call it makes to
the OS carries both. Files in the apps' data area carry an owner and a mode.

- **Modes are full Unix modes:** read, write and execute for owner, group and
  others.
- **Groups follow Unix's user-private-group scheme.** Each app has a group of
  its own, plus its install group as a second one, so Office's five apps
  share `imbatranim-office`. A suite's shared folder is setgid, so new files
  join its group.
- **Private by default:** new data files are `rw-------` and folders
  `rwx------`, as under umask 077.
- **Built-in apps share the group `system`.**

The owner, acting through Files or the Terminal, sees everything, as the
owner of the home folder.

**Why:** the owner asked for "a mix between processes from an unix system
and permissions unix system". Android isolates apps the same way, with one
Linux user per app.

**Why not real Linux users:** the container has one Linux user and no root,
and no brief may grant root. So the OS keeps owner and mode in its database
and enforces them in its own file API.

**The limit:** apps run in the desktop's page, so the OS checks each call,
but a hostile app could still reach around it, as threads in one Unix
process can. Each app's token is kept out of the others' reach, and the
catalog's review and the trust prompt guard the rest.

Rejected:
- owner and others read only, with no groups (the first proposal);
- moving every app into its own frame for real isolation, which would undo
  the shared kit and the native look.

Built in `apps-run-as-their-own-identity` (brief 68, `2522407`, 2026-11-06):
- **Tokens are minted by the client** and kept in memory, sent as
  `X-Imbatranim-App-Token`. A refusal (`APP_TOKEN_REFUSED`) makes the client
  mint a new one; a token lasts 6 hours idle, and a closed app's instance
  lives on for a 2 s grace.
- **Settings, Files and Terminal act as the owner** (`ACTS_AS_USER`).
- **Owner's stricter default (2026-11-06):** built-in apps lose blanket home
  access, with folders `rwx--x--x` and files `rw-------`. In effect since
  2026-11-09 (brief 70, `8b10be0`), with a grant path for each built-in's
  file flows (see the next section but one).
- **Limits against a hostile app:** its token is in the page's memory, so a
  script in the same page can read it; the checks guard the OS's calls, not
  the page. The catalog's review and the trust prompt guard the rest.
- **An uninstall ends its apps' identities** (2026-11-08): their tokens and
  file grants go when it starts, and until it ends they get no token and
  write no data. A catalog app no installed descriptor holds gets no token
  at all, since it would otherwise read as a built-in; so does an app from a
  URL (an `x-` id) once it isn't installed (2026-11-09).

## Installable apps keep data in folders by kind

Owner's pick: real files in a folder per app. The research split it the XDG
way:
- `~/.config/imbatranim/<app-id>/` for settings;
- `~/.local/share/imbatranim/<app-id>/` for data;
- `~/.local/state/imbatranim/<app-id>/` for history and recents;
- `~/.cache/imbatranim/<app-id>/` for anything that can be rebuilt.

`system.data` takes the kind. Uninstalling removes the cache always, and the
rest only when the owner ticks "Also remove its data". Windows also leaves
AppData behind when a program is uninstalled. Backups skip the caches.

The `imbatranim/` level keeps app ids from clashing with Linux programs'
folders, as Windows' vendor folder does. This refines the folder in
[decisions-marketplace-suites.md](decisions-marketplace-suites.md#an-app-keeps-its-data-in-a-folder-of-its-own-2026-11-06).
Built in `apps-get-a-data-folder-of-their-own`.

## Installable apps see other files only by grant

An installable app sees its own folders, plus any file or folder the owner
gives it:
- one opened with it through the OS (Files, Start's recents, Open With);
- one picked in `system.fs.pick*`.

A grant lasts for that window. Built-in apps are held to the same rule
since 2026-11-09 (the owner's stricter default above).

**Why:** Android's scoped storage, Flatpak's document portal and the macOS
sandbox's user-selected files all work this way. The OS already has the
pickers as a portal (2026-08-06), and Office already opens and saves only
what it was handed or picked.

Rejected: full home access for installable apps.

The REST API Client's typed file paths become a picker. Built in
`installable-apps-get-files-by-grant`.

What was built (brief 70, 2026-11-06 to 2026-11-09):
- **Who gives.** Core gives as the user for its launchers, Files, Start and
  the pickers. An open an app makes (`system.intents.openApp`) gives with
  the app's token: only what the app holds, or one of its own recent files
  (or recent repositories) to a window of its own. A notification action's
  payload is the app's words and gives nothing.
- **Grant kinds.** `file` (read, write, make), `read` (a file an app hands on
  that it may only read), `folder` (everything under it, except another
  app's data) and `listing`.
- **An opened file's folder (owner, 2026-11-09).** An OS-made open or a pick
  also gives a `listing` of the file's folder (list it, read the files
  directly in it) to an app whose manifest declares `readsOpenedFolder`:
  Media Player, Image Viewer and Notepad. Not subfolders, since a file at
  the top of home would otherwise give all of home. Rejected: the folder for
  every app; one file only for everyone (the queue, prev/next and relative
  images would break).
- **Reopening.** `system.fs.reopenRecent` gives a window one of its app's
  own recents again, with no more than the app could do to it when it was
  recorded (a recent says whether it was writable): the Code Editor's restored tabs, Git GUI's recent
  repos. Built-ins that made new files or picked folders on their own now
  ask in the OS's dialogs: Notepad's new file and image attach, the
  Snipping Tool's save, Git GUI's repository, find in files' folder.

## URL apps run natively once trusted (revisits 2026-10-07)

This revisits [decisions-marketplace.md](decisions-marketplace.md)'s
"Sandboxed apps from a URL": an app from a URL treated as malicious, run
prebuilt in an opaque-origin frame with `notify` only. The owner wants
every app to run like the others, as plugins.

- **Verified apps** are listed in a `verified.json` in imbatranim-apps, each
  entry a repo and a pinned commit. The OS reads the file at a commit pinned
  with each OS release, so the git hash vouches for it (apt reaches the same
  goal with signed metadata) and nothing changes between OS updates. They
  install like Marketplace apps.
- **Unverified apps** show a warning first. It names the publisher (the
  GitHub owner and repo), lists the capabilities, and says plainly that a
  trusted app acts as the owner, Terminal included. "Trust and install"
  sits behind a "More info" step, as Windows SmartScreen does. Every new
  commit asks again.
- **Choices are trust or cancel.** There is no sandboxed option, so the frame
  path can be retired once nothing uses it.
- **Settings shows where each app came from:** a Verified badge or "Trusted
  by you", with its source.
- **A trusted app builds from source at its pinned commit** like any
  Marketplace app, under the same identity and file-grant rules.

**Why:** the owner: "If it is not verified, it should show a pop-up at
installation like windows does with un-checked sources, if you say you trust
it, you can go forward to install it natively."

Rejected:
- keeping URL apps sandboxed;
- drawing their UI natively from a sandbox (remote-dom);
- a verified list read live from GitHub, where a compromised account could
  mark anything verified.

Built in brief 74 (2026-11-09). The sandboxed path is retired later, in the
todo `retire-the-sandboxed-url-app-path`.

## WASM threads are on

The desktop sends `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, and every frame it serves
sends matching headers. That is the Browser app's proxy origin; URL-app
frames go when the sandbox is retired. `credentialless` is the fallback if
`require-corp` blocks the proxy.

Rejected: threads off until an app needs them. Built in
`kit-apps-may-run-webassembly` (brief 67, `932d92e`, 2026-11-06):
- **WASM compiles** under `'wasm-unsafe-eval'` on `script-src`.
- **One switch:** `EMBEDDER_POLICY` in `security-headers.ts` is `require-corp`;
  `credentialless` is the fallback if it blocks something real.
- **Frames always send `require-corp`**, whatever the switch says; the
  URL-app frame carries no COOP.
- **URL apps get WASM without threads.**
- **Cost:** a popup opened from a proxied page loses `window.opener`, so a
  site's popup sign-in can break in the Browser.
