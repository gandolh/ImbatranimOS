# Brief 68 — Apps run as their own identity, and files carry Unix modes

## Context

The owner wants Unix-style processes and permissions for apps: "Each of them
should have their own process and identifier and they should be able to
read only their resources … Like a mix between processes from an unix
system and permissions unix system." Android isolates apps the same way,
with one Linux user per app. The model is decided in
[decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#apps-run-as-their-own-identity-and-files-carry-unix-modes)
and checked against Unix practice in
[research-unix-and-windows-conventions.md](../../wiki/research-unix-and-windows-conventions.md).
Promoted from the todo `apps-run-as-their-own-identity`.

Today:
- every app reaches the OS through its `system` handle
  (`packages/ui/src/system.ts`), minted by core per window, or per windowless
  service, widget or layer;
- calls go out with the signed-in session's cookie, so the backend knows the
  user but not which app is calling;
- catalog apps run in the desktop's page, and their capabilities are a fence,
  not a sandbox ([decisions-marketplace.md](../../wiki/decisions-marketplace.md)).

The container has one Linux user (`imbatranim`) and no root, and no brief may
grant root. So app identities and modes can't be Linux users or permission
bits: the OS keeps them and enforces them in its own file API.

This brief builds the identity and the mode store. Briefs 69 (data folders)
and 70 (file grants) use them.

## Owner decisions (settled 2026-11-06)

1. **Identity.**
   - Each running app has an identity, its app id, which acts like a Unix
     user.
   - Each running copy has an instance id, which acts like a pid.
   - Every call an app makes carries both.
   - The desktop's own UI, and the owner acting through Files or the
     Terminal, act as the user and see everything, like the owner of the
     home folder.
2. **Modes are full Unix modes:** read, write and execute for owner, group and
   others.
   - Each app has a private group of its own, and its install group (the
     descriptor id, so Office's five apps share `imbatranim-office`) as a
     supplementary group. Built-in apps share `system`.
   - New data is private, as under umask 077: files `rw-------`, folders
     `rwx------`.
   - A suite's shared folder is setgid (`rwxrws---`), so new files join the
     suite's group.
3. **Owner and mode live in the OS database**, keyed by path. A file with no
   row belongs to the user, as everything in home does today.
4. **One page has a limit.** Apps run in the desktop's page, so the OS checks
   every call, but a hostile app could still reach around it, as threads in
   one Unix process can. Each app's token is kept out of the others' reach as
   far as one page allows, and the catalog's review and the trust prompt
   (brief 74) guard the rest.
5. **Processes in System Monitor** are a follow-up todo. End works like TERM
   then KILL: ask the app to close, then force it.

## What to do

1. **Tokens.**
   - Core mints an app token per running instance: an opaque id the backend
     maps to the app id, instance id and session.
   - The token is revoked when the instance closes, or with its session.
   - Every `system` call sends it in a header, and the backend resolves it to
     the caller, with a request-scoped identity the modules can read.
   - Calls without a token are the user's: the desktop's own UI, Files, the
     Terminal.
2. **Keeping tokens apart.**
   - Core captures `fetch`, `XMLHttpRequest`, `WebSocket` and `Headers` before
     any app module loads.
   - Each handle holds its token in a closure and sends it only through those
     captured functions, so an app that patches the globals can't read
     another app's token.
   - Write down what this does and doesn't stop.
3. **The mode store.**
   - A table keyed by path, holding owner, group and mode.
   - Helpers for the checks: may this identity read, write or list this
     path. Folders need execute to be traversed, and setgid passes its group
     on.
   - Group membership: the app's own group, its install group, and `system`
     for built-ins.
4. **Enforcement** in the backend's file paths that take an identity. Brief
   69's `system.data` and brief 70's `system.fs` are the users; here the
   checks get their tests against a test route.
5. **Tests:**
   - a token maps to its app and instance, and dies with it;
   - a forged or expired token is refused;
   - owner, group and others each read and write per mode;
   - a setgid folder passes its group on;
   - the user (no token) reads everything;
   - a patched global `fetch` in one app doesn't see another app's token.
6. **Corpus:**
   - decisions-app-identity-and-trust.md (what was built, and the limits in
     decision 4);
   - glossary-marketplace (app identity, instance), status, log;
   - a todo for the System Monitor processes view per decision 5.

## Files you OWN

- core's `system` handle minting and its request layer, a backend identity
  guard and the mode store with their tests, the corpus pages

## Files you must NOT touch

- `apps/backend/src/modules/files/` behaviour (brief 70 changes it).
- The session, sign-in and Ward code, beyond reading the session.

## Acceptance

- Tests green; the full test run is unchanged for built-in apps and Office.
- The outcome lists, plainly, what a hostile in-page app could still do.

## Outcome (2026-11-06)

Built from the main session by an opus subagent, commit `2522407` (1.196.0).
Every call an app makes carries `X-Imbatranim-App-Token`; the backend resolves
it to `req.appIdentity` (`callingApp`, `@CallingApp`). A `ModeStore` and a
`file_modes` table keep owner and mode per file. Tokens are minted by the
client and held in memory (6 h idle); a refused token (`APP_TOKEN_REFUSED`)
makes the client mint a new one; a closed app's instance lives on for a 2 s
grace. Settings, Files and Terminal act as the owner (`ACTS_AS_USER`).
`revokeApp` is not called on uninstall yet. A System Monitor processes view,
fed by `AppTokens.instances(sid)`, is a todo idea.

Owner decision the same day: a stricter default than the brief's. Built-in
apps lose blanket home access (folders `rwx--x--x`, files `rw-------`). Brief
70 flips the default together with the grant flows for built-ins (a folder
picker for Code Editor, Git GUI and the media apps); until then the brief's
default stands in the build. Recorded in brief 70 (`0e0aa71`) and the ticket.

Checks: the notes give no test counts for this brief. Walk 1 (2026-11-06,
11 of 11) covered identity. A hostile app can still reach around the
checks (see [decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md)).
Left for the owner: deploy; brief 70's flip of the default.
