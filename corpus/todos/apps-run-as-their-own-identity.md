---
title: Apps run as their own identity, and files carry owner permissions
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Apps run as their own identity, and files carry owner permissions

Unix-style processes and permissions for imbatranimOS's apps: every running app has an identity (its app id, like a user) and an instance id (like a pid), every call it makes to the OS carries them, and files in the data area carry an owner and a mode, so app B can't read app A's owner-only file. The OS enforces it in its own file API.

From the imbatranim-apps grill on 2026-11-06. The owner: "Each of them
should have their own process and identifier and they should be able to
read only their resources … Like a mix between processes from an unix
system and permissions unix system." Then: "enforce for all". Grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled on 2026-11-06:
- every app call carries the app's identity and every data file an owner
  and a mode, for every kind of app;
- the OS enforces them itself. The container has one Linux user and no root,
  so these are not Linux users or permission bits;
- every app runs in the desktop's page, URL apps too once trusted
  ([url-apps-install-natively-once-trusted](url-apps-install-natively-once-trusted.md));
- apps in the desktop's page are checked the same way, with their identity
  kept out of each other's reach as far as one page allows, and the
  catalog's review guards the rest. The owner acting through Files or the
  Terminal sees everything, like the owner of the home folder.

1. **Which modes?** Answered 2026-11-06: full Unix modes, read, write and execute for owner, group and others. Each app has a private group of its own (Unix's user-private-group scheme) plus its install group as a supplementary group (the descriptor id, so Office's five apps share `imbatranim-office`); built-in apps share `system`. New data is private, as under umask 077 (`rw-------`, folders `rwx------`); a suite's shared folder is setgid `rwxrws---`, so new files join its group.
2. **Where do owner and mode live?** Answered 2026-11-06: yes.
3. **Do running apps show as processes?** Answered 2026-11-06: yes, as its own todo after this one. End works like TERM then KILL: it asks the app to close (unsaved work prompts), then forces it after a timeout.
4. **What does `fs` see?** (Superseded the same day by [installable-apps-get-files-by-grant](installable-apps-get-files-by-grant.md): installable apps see only their folders and granted files.) Answered 2026-11-06: yes.

## Draft brief

### Context

- Catalog apps run in the desktop's page; their capabilities are a fence,
  not a sandbox ([decisions-marketplace.md](../wiki/decisions-marketplace.md)).
- URL apps run in an opaque-origin frame behind a per-window token.
- Installed apps' data goes to `~/.local/share/imbatranim/<app-id>/`
  ([apps-get-a-data-folder-of-their-own](apps-get-a-data-folder-of-their-own.md)).
- All of an app's calls to the OS go through its `system` handle
  (`packages/ui/src/system.ts`), minted per window or per windowless service
  by core.

### What to do

1. **Identity.** Core mints an app token for each running instance, carrying
   the app id and the instance id. Every `system` call sends it, and the
   backend resolves it to the caller. The desktop's own UI keeps the user's
   session. Core takes `fetch` and the other request primitives before any
   app loads, so an app that patches the globals can't read another app's
   token.
2. **Owner and mode** per question 2. The data call creates files owned by
   the caller and owner-only.
3. **Enforcement** in the file paths the backend serves (`system.data`,
   `system.fs`): read and write checked against the caller's identity and
   the file's owner and mode.
4. **Tests:** app A's owner-only file is refused to app B through both
   `system.data` and `system.fs`; Files and the Terminal can read it; a
   stolen or expired token is refused; a URL app's frame carries its own
   identity.
5. **Corpus:** a decision page entry (the model, and why not Linux users), the
   glossary (identity, instance), status, log.

### Acceptance

- Tests green; the walk shows A's private file invisible to B and visible in
  Files.
