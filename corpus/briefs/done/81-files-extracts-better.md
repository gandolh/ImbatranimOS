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

## Outcome (2026-11-09)

Built in `95b331d` (1.279.0); imbatranim-apps' kit sync is `6538699`. Ready
for deploy.

**Lone compressed files.** `detectFormat` keeps the zip and tar suffixes as
they were. A name ending in plain `.gz`, `.xz` or `.bz2` is read by content:
the first bytes (`1f 8b`, `fd 37 7a 58 5a 00`, `BZh`) pick the decompressor,
so xz bytes under a `.gz` name still unpack; no match is a 400 ("not a gzip,
xz or bzip2 file"). The first 512 decompressed bytes then say whether a tar
is inside (`ustar` at offset 257): if so it is a tarball like any `.tar.gz`,
into a folder named without the suffix. Otherwise one file goes beside the
archive, or into the chosen folder: `notes.txt.gz` → `notes.txt`, then
`notes (2).txt`, `notes (3).txt` (the number before the last extension, as
Files numbers a new zip; `.bashrc (2)` for a hidden file). The compressed
file stays. A file called just `.gz` is a 400. `list` answers one row.

**How.** gzip is Node's zlib (`createGunzip`, multi-member files included).
xz and bzip2 are busybox `xzcat` and `bzcat`, spawned with no shell and no
argv: the archive is the child's stdin. Bytes are counted on the way
through against the smaller of the entry and total caps (512 MiB by
default), on bytes produced, not on the gzip trailer (modulo 4 GiB, and
anyone writes it). The zip ratio cap is not applied: it bounds a
header-driven pre-allocation that a stream doesn't make. The output is
decompressed into a hidden `.extract-<uuid>.part` in the target folder
(opened `wx`), then hard-linked to the first free name; `link` fails over
anything there, a dangling symlink included, so the name is claimed by the
write itself (an exclusive copy where there are no hard links). The module's
tar timeout bounds it all.

**Busybox in the image.** `node:24.22.1-alpine` (Alpine 3.24.3) in both the
dev and prod stages: `xzcat`, `unxz`, `bzcat`, `bunzip2`, `zcat` and
`gunzip` all resolve to `/bin/busybox` in `infrastructure-dev-1`. Fed on
stdin they decompress; a damaged file exits 1 ("corrupted data", "bunzip
error -3"); input without the magic exits 0 with nothing, which the magic
check rules out first. Known limit: busybox's xz decoder takes LZMA2 only, so
an `.xz` made with a BCJ or delta filter reads as damaged (400).

**Picker.** Kit 1.8.0: `PickDirectoryOptions = { title?, startIn? }`,
passed through `createSystemHandle` and `useFileDialog`. `FilePicker`'s
`resolveStart` needed nothing: a start it can't list (unknown root, `..`, a
folder the jail refuses or that is gone) opens at the home root, as for Open
and Save as. Files' Extract dialog passes the archive's folder; for a lone
file it says "Beside it, as notes.txt" and names that file in its title and
progress. Code Editor and Git GUI call `pickDirectory` unchanged.

Also: an archive the module can't read no longer leaves an empty `name (2)`
folder (the format is read before the destination is made). The empty
folder after a refused zip-slip is still there.

**Self-review.**
- Writes: the target folder goes through `resolveSafe` (lexical and realpath
  jail), then everything happens in its real path; `../escape` and a symlink
  out of the jail as `dest` are refused (tested). The output name is the
  archive's basename minus the suffix, so no `/` or `..`. A symlink at the
  output name is skipped to the next number and its target untouched
  (tested). Staging is `wx`, removed only if this made it. After the link the
  folder's real path must be unchanged, or the placed file is taken back
  out, but only when it is still this file's inode.
- Limits: a 1 MiB-of-zeros bomb under a 4 KiB cap is a 413 for each of gz,
  xz and bz2, leaving only the archive (tested). The child is SIGKILLed and
  awaited on any failure, so it is reaped; `pipeline` destroys every stream
  on error, and a staging stream that never started is destroyed.
- Errors: the child's `error` and `close` are listened for before anything
  awaits (the first version awaited between and crashed the test on a
  missing binary). A missing decompressor is a 500 naming it; a damaged file
  a 400; a timeout a 408. No unhandled rejections; the job path reports the
  message.
- Grants: the archive routes stay `UserOnlyGuard`, so no app reaches the new
  path. `startIn` only chooses where the OS dialog opens; it lists as the
  user, as Open and Save as do, and the app receives only the pick, granted
  as before.
- HTTP: the acceptance asks for service-level refusals; there are no archive
  e2e specs, and none were added.

Checks run: backend `tsc`; core `tsc -b`; file-manager and kit `tsc`; eslint
and prettier on changed files; backend jest archive and backup (133, 19 new
in `archive.compressed-file.spec.ts`); file-manager vitest (113, 4 new); core
`filePortal` and `createSystemHandle` (32, 6 new); kit vitest (42);
imbatranim-apps' kit snapshot test, `kit:sync --check` and Office's vitest
(`apps/`, 694 passed; the PDF engine test timed out once under load and
passes alone). Skipped: full suites and the browser walk.

Owner steps: push imbatranim-apps first (the kit sync), then imbatranimOS,
then `node cli.ts imbatranim-os deploy` from vps-deploy. Walk: in Files, put
`notes.txt.gz` (`gzip -k notes.txt`), a `.xz` and a `.bz2` beside an existing
`notes.txt`; double-click each: the dialog says "Beside it, as notes.txt",
Extract makes `notes (2).txt`, `notes (3).txt`…, the compressed files stay;
"Choose folder…" opens in the archive's folder; a `.tar.gz` still opens like
a folder.
