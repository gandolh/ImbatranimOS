# Brief 81 — Files extracts better

## Context

Two gaps left by brief 66 (Files opens archives), promoted from the todos
`files-extracts-lone-compressed-files` and `pick-directory-starts-in-a-folder`
in the 2026-11-09 backlog grill.

1. A lone `.gz`, `.xz` or `.bz2` file (not a tarball) fails with
   "Unsupported archive format": `detectFormat` in
   `apps/backend/src/modules/archive/archive.service.ts` knows only zip and
   the tar flavours.
2. The kit's `fs.pickDirectory` (`packages/ui/src/system.ts`) takes only a
   title, so "Extract to…" in Files
   (`apps/add-ons/file-manager/src/components/ExtractDialog.tsx`) opens
   wherever the picker opens by default, not in the archive's folder.

## Depends on

- brief 66 (archives in Files), brief 70 (pickers grant what they pick).

## Owner decisions (settled 2026-11-09)

1. A lone compressed file unpacks next to itself, under the same name
   without the suffix (`notes.txt.gz` → `notes.txt`). A taken name gets a
   number (`notes (2).txt`, or whatever Files already does for clashes). The
   compressed file stays.
2. Both gaps ship in this one brief.

## What to do

1. The archive backend recognises a lone `.gz`, `.xz` and `.bz2` (by
   content where it can, not only the suffix; a `.tar.gz` stays a tarball)
   and extracts it to one file beside it, with the same size and safety
   limits as the other formats. Files offers Extract on such a file.
2. `pickDirectory` takes an optional start folder (`startIn: { root, path }`
   or whatever matches `pickSave`'s option). The picker opens there if the
   caller may list it, else where it opens today. That's a kit minor version;
   re-sync the vendored kit in imbatranim-apps (`kit:sync`, commit the kit
   first, update the snapshot test) and rerun Office's tests.
3. "Extract to…" passes the archive's folder.

## Files you OWN

- `apps/backend/src/modules/archive/`, `apps/add-ons/file-manager/`,
  `packages/ui/src/system.ts` and the picker in `apps/core/src/system/`
  (`filePortal.tsx`), the kit version
- in imbatranim-apps: the kit snapshot and its test
- their tests, `corpus/`

## Files you must NOT touch

- The zip and tar paths' behaviour.

## Acceptance

- Tests: `.gz`, `.xz` and `.bz2` holding one file extract next to it with
  the suffix dropped; a clash gets a number; the original stays; a
  `.tar.gz` still extracts as a tarball; an over-limit stream is refused.
- `pickDirectory` with a start folder opens there; without one, as today;
  a start folder the caller can't list falls back.
- Backend and core typecheck, the archive specs, the file manager's tests,
  imbatranim-apps' kit snapshot test and Office's tests pass.
