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
