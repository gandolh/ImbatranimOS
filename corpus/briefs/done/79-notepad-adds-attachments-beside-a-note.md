# Brief 79 — Notepad adds attachments beside a note

## Context

Since brief 70, Notepad's image attach asks in the Save dialog, because
Notepad only gets read on the opened note's folder (decision 6, the
`listing` grant for apps that declare `readsOpenedFolder`). On 2026-11-09
the owner chose to make attaching silent again, without letting Notepad
overwrite anything: see "Notepad's attachments" in
[decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#installable-apps-see-other-files-only-by-grant).

## Depends on

- brief 70 (grants, grant kinds, `readsOpenedFolder`).

## Owner decisions (settled 2026-11-09)

1. An OS-made open (Files, Open with, Start, a pick handed on by core) also
   lets an app whose manifest declares it create new files in an `assets/`
   folder beside the opened file, making the folder if it isn't there.
2. Create only: the app can't replace, rename or remove anything in
   `assets/`. A name already taken gets a number (`shot.png`,
   `shot-2.png`).
3. Only Notepad declares it. An app-made open never gives it.
4. (Owner, 2026-11-09, before the build; extends decision 1.) The grant
   also lets the app list `assets/` and read the files in it, still never
   replace, rename or remove anything. So the preview shows attached images
   on every reopen and Notepad picks a free name by listing.

## What to do

1. A manifest flag beside `readsOpenedFolder` (pick a plain name, such as
   `addsBesideOpened`) on `AppConfig`, declared by Notepad.
2. A grant kind for it (for example `assets`, through a ledger step that
   widens `file_grants.kind`) that allows only creating a file under
   `<folder>/assets/`, plus making that folder. The backend refuses a
   write to an existing path under it, and any write outside it.
3. Core asks for it with the folder read on OS-made opens, for declaring
   apps only.
4. Notepad's image attach writes the image straight into `assets/` with a
   free name and inserts the relative link, with no dialog. If the grant
   is missing (an app-made open, a note opened some other way), it falls
   back to today's Save dialog.

## Files you OWN

- `apps/backend/src/modules/files/` (the grant kind, its checks), the ledger
  step, `apps/core/src/` where `readsOpenedFolder` is handled, `contract.ts`
- `apps/add-ons/notepad/`
- their tests, `corpus/`

## Files you must NOT touch

- Other apps' manifests; the `listing` and `read` kinds' rules.

## Acceptance

- e2e: with the grant, a create under `assets/` succeeds and makes the
  folder; a second create with the same name is refused (the app picks the
  next name); overwriting, renaming or removing an existing file under
  `assets/` is refused; a create beside the note (not under `assets/`) is
  refused; an app without the flag gets no such grant; an app-made open
  gives none.
- Notepad tests: attach writes to `assets/` with a free name and inserts
  the link; without the grant it opens the Save dialog.
- Backend and core typecheck, the files/grants unit and e2e specs, and
  Notepad's tests pass.

## Outcome (2026-11-09)

Ready for deploy. Built in `a8cad71` (1.273.0).

- **The flag** is `attachesUnderAssets` on `AppConfig` (core's
  `contract.ts`), declared by Notepad alone. Core asks for it with
  `withAssets` beside `withFolder`: on OS-made opens in `openApp.ts` and on
  picks in `createSystemHandle.ts`; an app-made open never sends it, and the
  backend refuses it from an app token.
- **The grant kind** is `assets`, keyed on `<folder>/assets` (beside the
  `listing` on `<folder>`), in `app-identity/file-grants.service.ts`; ledger
  step 19 rebuilds `file_grants` with the wider CHECK. It covers `create`,
  `list` and `traverse` on the folder itself and `read` and `create` on the
  entries directly in it, never `write` or `delete`. Nothing deeper. An
  `assets` grant never replaces a `folder` grant on the same path, and a
  `listing` never replaces an `assets` one. Given only when the note's
  folder exists and `assets` there is a real folder or not there yet.
- **Create, not write.** A write to a taken name answers 409 `NAME_TAKEN`
  with the file's version (Notepad takes the next name). A new file the
  grant makes is staged beside the target and placed with a hard link, which
  fails on anything already there, a dangling link included, so a file that
  appeared after the check is never replaced (unit-tested with a staged race).
  The rename-over path is unchanged for everyone else. While there, a file
  copy now uses `COPYFILE_EXCL`, since the route already refused an existing
  destination.
- **Symlinks.** A symlinked `assets/` gets no grant at all, and the
  realpath'd key keeps a link swapped in later outside the grant.
- **Notepad** lists `assets/` (404 is "not made yet", 403 is "not given"),
  uploads to `assets/<free name>` and inserts the relative link with no
  dialog; up to five tries on a 409. A 403 on the list or the write falls
  back to the Save dialog as before. `assetDir` is always `assets/`.
- **Numbering** follows the owner's decision 2, `shot.png`, `shot-2.png`,
  rather than Files' `base (2).zip`: the dash form needs no `%20` in a
  Markdown link, and the base names are already slugs. Notepad's
  `uniqueName` used to start at `-1`; it starts at `-2` now, in both the
  silent path and the dialog's suggestion.

Found while building: the preview's images were never refused on reopen.
`fs.downloadUrl` is a bare URL the browser fetches with the cookie and no
app token, so it is served as the user. Decision 4's list and read matter
for the free-name scan and for any app that reads `assets/` with its token.

Tests: backend unit (files, app-identity, db, 181), the file-grants, files
and app-identity e2e specs (52), core's fileGrants and filePortal (24),
Notepad's vitest (156); backend, core and Notepad typechecks; eslint on the
changed files. No browser walk.

Owner steps: push imbatranim-apps first (it has unpushed commits; this brief
adds none), then imbatranimOS, then `node cli.ts imbatranim-os deploy` from
vps-deploy. Walk: open a note from Files in a folder with no `assets/`,
paste a screenshot (no dialog, the link and the preview show it, Files shows
`assets/image.png`); paste again (`image-2.png`); reopen from Files (the
images show, a third paste gives `image-3.png`); open the same note from
another app (the paste asks in the Save dialog).

Still open:
- An installable app can't declare `attachesUnderAssets` (the descriptor
  schema doesn't carry it, as with `readsOpenedFolder`).
- A Save as into a folder that isn't there yet gives no `assets` grant, as
  with the folder listing: the first paste there asks in the dialog.
- The grant allows making a subfolder directly in `assets/` (making a file
  and a folder are the same `create`); nothing can go inside it.
