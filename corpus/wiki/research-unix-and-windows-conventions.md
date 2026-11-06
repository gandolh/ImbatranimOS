---
summary: Research (2026-11-06) on how Unix/Linux, Windows, Android and macOS handle the things the imbatranim-apps grill designed, so imbatranimOS follows their best practice. It covers where an app's files go (XDG config/data/state/cache, Windows AppData), app identity and permissions (Unix users, groups, umask, setgid; Android's user per app), file access beyond an app's own (Android scoped storage, Flatpak portals, macOS user-selected files), installing unknown software (Windows Mark of the Web and SmartScreen, macOS Gatekeeper, Flathub's verified badge, apt's signed repos), and ending processes (TERM then KILL). There is a table of practice, meaning here and the todo it changes, plus what was not taken and why. The calls are in decisions-app-identity-and-trust.md.
updated: 2026-11-06
---

# Research: Unix and Windows conventions for apps (2026-11-06)

The owner, mid-grill on 2026-11-06: "research what unix and dos does and
follow best practices for some of those system". This page covers the
systems the grill designed: app data folders, app identity and permissions,
file access, trusting unknown apps, and processes. The calls that came of it
are in
[decisions-app-identity-and-trust.md](decisions-app-identity-and-trust.md).

## 1. What each system does

**Where an app's files go.**
- The [XDG Base Directory spec](https://specifications.freedesktop.org/basedir-spec/latest/ar01s02.html)
  splits a user's app files by kind: `~/.config` for configuration,
  `~/.local/share` for data, `~/.local/state` for state, and `~/.cache` for
  "non-essential data". State is data that persists between restarts but
  isn't worth keeping as data: logs, history, recently used lists
  ([Gentoo wiki](https://wiki.gentoo.org/wiki/XDG/Base_Directories)). A cache
  can be regenerated and losing it is harmless. The runtime directory must
  be owned by the user with mode 0700
  ([Arch wiki](https://wiki.archlinux.org/index.php/XDG_Base_Directory_support)).
- Windows splits `AppData` into Roaming (settings that follow the user
  between machines), Local (machine-specific data and caches) and LocalLow
  (low-integrity, sandboxed processes), with `ProgramData` for all users
  ([AppData overview](https://skjoldrun.github.io/docs/csharp/appData-folders.html),
  [Windows Report](https://windowsreport.com/local-locallow-roaming-difference/)).
  Apps sit under a vendor folder. Uninstallers commonly leave AppData
  behind (known practice, not from these sources).

**Identity and permissions.**
- Unix gives every process a user and groups. Files carry owner, group and
  read/write/execute bits for owner, group and others.
- A umask sets the default; 077 makes new files private.
- A setgid directory makes new files inherit its group, which is how a team
  shares a folder.
- Debian and Red Hat give each user a private group of the same name, and
  sharing goes through extra groups. (All of this is standard Unix and not
  from these sources.)
- [Android's application sandbox](https://source.android.com/docs/security/app-sandbox)
  builds app isolation on exactly this. Each app has its own Linux user and
  process, and the kernel enforces app-to-app separation through ordinary
  user and group IDs. Later layers added seccomp (8.0), SELinux per app
  (9) and scoped storage (10). The
  [Chromium Android sandbox notes](https://chromium.googlesource.com/chromium/src/+show/00b1750b7cc977e46ff486e2543f45dc706040a6/docs/security/android-sandbox.md)
  call world-readable app data a poor practice, since it can't be limited to
  the intended reader.

**Files beyond an app's own.** Android 10 took away apps' raw paths to shared
storage. An app now gets documents through intents such as
`ACTION_OPEN_DOCUMENT`, and media through MediaStore under a permission
([AOSP](https://source.android.com/docs/security/app-sandbox)). Flatpak's
document portal and the macOS sandbox's user-selected-files entitlement
work the same way: the user's pick is the grant (known practice).

**Running unknown software.**
- **Windows** marks downloaded files with the Mark of the Web, then checks
  the code signature when the program runs. A signed program shows its
  publisher, or runs silently once its certificate has a reputation. An
  unsigned one warns of an "unknown publisher"
  ([textslashplain, 2024](https://textslashplain.com/2024/11/15/best-practices-for-smartscreen-apprep/),
  [Microsoft archive](https://learn.microsoft.com/en-us/archive/blogs/vsnetsetup/windows-smartscreen-prevented-an-unrecognized-app-from-running-running-this-app-might-put-your-pc-at-risk)).
  SmartScreen's blue dialog interrupts an "unknown" file, and "Run anyway"
  sits behind "More info". EV certificates no longer skip the reputation
  wait.
- **macOS** Gatekeeper blocks downloaded software that isn't notarised with
  a Developer ID by default
  ([SSLTrust](https://www.ssltrust.com.au/learning/code-signing/unknown-publisher-warnings)).
- **Flathub** gives a blue verified tick when the developer proves control of
  the app id's domain, or logs in with the code host account
  ([Flathub docs](https://docs.flathub.org/docs/for-app-authors/verification)).
  Users can add only the verified subset (`--subset=verified`).
- **apt** trusts a repository through signed release metadata, so trust sits
  with the repository's key, not each package (known practice).

**Processes.** `ps` lists pid, parent, user and start time. `kill` sends TERM so
a program can clean up, then KILL if it doesn't, and a user can signal only
its own processes. Windows' End task asks the window to close, then forces
it. (Standard practice.)

## 2. What we take

| Practice | Here | Todo |
|---|---|---|
| XDG kinds, with a vendor folder like Windows | `~/.config`, `~/.local/share`, `~/.local/state` and `~/.cache`, each under `imbatranim/<app-id>/`; `system.data` takes the kind | apps-get-a-data-folder-of-their-own |
| Caches are disposable | Uninstall always removes the cache; backups skip caches | same |
| Uninstall keeps user data | Already chosen ("Also remove its data", unticked) | same |
| Unix modes, private groups, umask 077 | rwx for owner, group, others; a private group per app plus its install group; new data private | apps-run-as-their-own-identity |
| setgid shared folder | A suite's shared folder keeps files in its group | same |
| Android's user per app | The app id acts as the user, the instance as the pid, kept by the OS (one Linux user, no root) | same |
| Scoped storage, portals | Installable apps get other files only by grant: opened through the OS or picked | installable-apps-get-files-by-grant |
| Unknown-publisher warning | Publisher named, capabilities listed, "acts as you, Terminal included", trust behind More info | url-apps-install-natively-once-trusted |
| Signed repo metadata, Flathub verified | `verified.json` read at a commit pinned per OS release, where the git hash gives integrity; a Verified badge | same |
| Mark of the Web, reputation | Settings shows each app's source and "Verified" or "Trusted by you"; a new commit asks again | same |
| TERM, then KILL | End asks the app to close (unsaved work prompts), then forces it after a timeout | apps-run-as-their-own-identity (System Monitor follow-up) |

## 3. What we don't take, and why

- **Roaming and Local.** Nothing roams here: one machine, one home volume.
- **Code signing certificates.** The pinned commit hash of the source plus a
  reviewed list does the job of a signature for code built from source. A
  per-publisher reputation would need a service the OS doesn't have.
- **seccomp and SELinux-style layers.** They need the kernel's help per
  process, and apps here share one browser page. The identity checks are the
  layer available.
- **A live verified list (apt-style signed metadata).** It is the next step if
  the owner ever wants verified apps without an OS update. Today the
  per-release pin is simpler and needs no keys.
