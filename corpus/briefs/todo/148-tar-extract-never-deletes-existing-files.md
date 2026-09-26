# Brief 148 — Extracting a tarball never deletes existing files

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM · BACKEND
(`apps/backend/src/modules/archive/archive.service.ts`, extract path + specs).
Independent. Implement inline.

## Context

"Extract here" (file manager → `archive-manager`) extracts into a sibling
folder named after the archive — `deriveDest` (`archive.service.ts:1090-1097`)
turns `foo.tar.gz` into `foo/` — created with `mkdir -p` (`:450`). So
extracting the same archive again lands in the **existing** folder, and
nothing in the UI warns about it.

- **zip** writes each file individually (`extractZip`): a file at the same path
  is overwritten, everything else is kept.
- **tar** stages into a temp dir, then `mergeTree` (`:842-861`) does, for each
  **top-level** entry: `await fs.rm(dst, { recursive: true, force: true })`
  (`:857`), then `await fs.rename(src, dst)` (`:858`).

**Failure:** extract `project.tar.gz` (top-level directory `project/`), work
inside `foo/project/` for a day, then choose "Extract here" again — by accident,
or to recover one pristine file. The whole `foo/project/`, with every edit and
every new file, is removed with `rm -rf` and replaced by the archive's copy. No
prompt, no Trash. A crash between `:857` and `:858` loses both copies, and
`extractTar`'s `finally` (`:672-674`) then deletes the staged copy too.

Real desktops never do this: extracting into an existing name creates
`foo (2)`, or asks per file.

## Files you OWN

- `apps/backend/src/modules/archive/archive.service.ts` — `extract`,
  `deriveDest`, `extractTar`, `mergeTree`
- `archive.service.spec.ts` / `archive.brief78.spec.ts`

## Files you must NOT touch

- `stageTarExtraction` and the jail and bomb guards (security-reviewed — reuse
  them as they are); the backup restore path (`backup.service.ts` has its own
  `swapIn`).

## What to do

1. **The default destination is never an existing path.** When the caller
   passes no `dest` and the derived folder exists, pick `foo (2)`, `foo (3)`, …
   (the Trash's `uniqueName` convention). The response already carries `dest`,
   so the UI can reveal the folder it actually used.
2. **An explicit destination merges file by file, for zip and tar alike.** Walk
   the staged tree: `mkdir -p` directories, `rename` files over same-path
   files, never `rm -rf` a directory that exists at the destination.
3. Check that archive-manager's completion message names the destination folder
   (add it if not).

## Must preserve

- All of brief 44's and 78's guards: the member-name jail, symlink-escape and
  hardlink rejection, entry/byte/ratio caps, `--no-same-owner`, staging cleanup
  on failure.

## Acceptance

- Specs: extracting into a derived destination that already exists creates
  `name (2)` and leaves `name/` byte-identical, including files the archive
  does not contain. Extracting into an explicit existing destination keeps files
  absent from the archive and overwrites same-path files — for zip and tar.
- Backend unit + e2e green.
