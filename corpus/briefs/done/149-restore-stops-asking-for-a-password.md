# Brief 149 — Restore stops asking for a password that no longer exists

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · CORE
(`apps/core/src/modules/settings/BackupSettings.tsx`) + BACKEND
(`apps/backend/src/modules/backup/backup.controller.ts`, `apply`). Independent;
brief 142 edits the same controller, so land them one after the other.
Implement inline.

## Context

Since the Ward cutover a restore cannot change who may sign in, and the backend
says so: `backup.service.ts` `installDatabase`'s header, and
`backup.controller.ts:110-131`, which returns `signedOut: false` with the note
"it should be dropped once the UI stops reading it". The UI was not updated:

- `BackupSettings.tsx:204`, shown before restoring: "You will be signed out
  afterwards, because the backup brings its own password with it."
- `:135`, after: "Your home directory was replaced. Sign in again with the
  password from that backup."
- `:142` — `setAuthenticated(false)` puts the user on the sign-in cover for no
  reason; with Ward that means leaving the page for Ward's login and a full
  reload.

Also, `backup.controller.ts:112-113`: the now-unused `@Req() req` and
`@Res({ passthrough: true }) res` are the **two errors that keep the backend's
eslint red** (`npx eslint "{src,test}/**/*.ts"` in `apps/backend` → 2 errors;
the `lint` script's `--fix` cannot remove them). The controller's header
comment (`:35`) also still cites the deleted `SessionAuthGuard`.

## Files you OWN

- `apps/core/src/modules/settings/BackupSettings.tsx`
- `apps/backend/src/modules/backup/backup.controller.ts` — `apply` and the
  header comment
- `apps/backend/src/modules/backup/backup.brief80.spec.ts`

## Files you must NOT touch

- `README.md`'s "Data & backup" wording — brief 153 rewrites it. Tell 153 what
  changed.

## What to do

1. Backend: `apply` returns `{ restored, createdAt, totalBytes }`; drop
   `signedOut`, `req` and `res`. The header comment names `WardAuthGuard`.
2. Frontend: say what is true — the restore replaces the listed folders, and
   the desktop reloads to pick up the restored settings. After success, notify
   and call `location.reload()`: dotfiles, wallpaper and window preferences
   came from the backup and must be re-read. Do not touch the auth store.

## Acceptance

- `npx eslint "{src,test}/**/*.ts"` in `apps/backend` reports 0 errors.
- The brief-80 spec asserts the response has no `signedOut`; a core test (or a
  browser check) confirms a successful restore does not call
  `setAuthenticated(false)`.
- Nothing in `apps/core/src` says a password comes from a backup.

## Outcome (2026-10-03)

Done.
- **Backend:** `apply(@Body() dto)` returns `this.backup.apply(dto.id)`, which is `{ restored, createdAt, totalBytes }`. `signedOut`, `req`, `res` and the `Req`/`Request` imports are gone. The header names `WardAuthGuard` and no longer claims the database holds a credential hash (brief 150 dropped those tables).
- **Desktop:** `BackupSettings.tsx` no longer imports the auth store.
  - The intro says "settings" instead of "passwords".
  - The restore copy says the desktop reloads afterwards and you stay signed in.
  - The button is "Restore and reload", not "Restore and sign out"; the browser check caught that leftover.
  - Success shows a toast, then `location.reload()` after 1.5 s.

**For brief 153** (README "Data & backup"): a restore replaces the folders the backup contains, leaves everything else, and reloads the desktop. Nobody is signed out, and a backup carries no credentials (brief 150).

**Tests:** the brief-80 spec gains a controller-level case asserting the response keys are exactly `createdAt`, `restored` and `totalBytes`. `npx eslint "{src,test}/**/*.ts"` in `apps/backend` reports no errors from this controller (the two it named are fixed). The remaining errors that run reported were in the brief-154 spec staged at the same time, and that spec is clean once 154 lands. Core typecheck is clean.

**Browser check** (dev desktop, local Ward, scratch home):
1. Backup → "Download backup" saved a `.tar.gz`.
2. `marker.txt` was changed, then the backup uploaded, `RESTORE` typed, and "Restore and reload" clicked.
3. The page reloaded, `marker.txt` held its pre-backup content again, and the desktop came back signed in (`/me` 200, no sign-in cover).
