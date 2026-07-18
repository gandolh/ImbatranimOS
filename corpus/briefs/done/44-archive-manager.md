# Brief 44 — Archive manager

Status: **todo** · Promotes [archive-manager-addon](../../todos/archive-manager-addon.md).
Wave D. **Medium-hard → senior/opus.** New **backend** module
`apps/backend/src/modules/archive/` + file-manager context-menu wiring (+ a small
`apps/add-ons/archive-manager/` progress/browse window). **Security-reviewed
before commit** (zip-slip is the core risk).

## Problem

No way to extract or create archives. Users want to unzip a `.zip`/`.tar.gz` and
compress selections, inside the home FS, without the terminal.

## Decisions (grilled 2026-07-18)

- **Backend does the work, inside the FS jail.** Extract/compress run server-side
  as the unprivileged `imbatranim` user; every source and destination path is
  resolved through `FilesService.resolveSafe` (reuse it — inject `FilesService`).
- **Zip-slip guard is mandatory and load-bearing.** For EVERY entry in an
  archive, join its entry name to the destination and re-validate with
  `resolveSafe` (or an equivalent lexical+realpath containment check) BEFORE
  writing. An entry named `../../etc/x` or an absolute path or a symlink entry
  pointing outside the dest MUST be rejected (fail the extraction or skip+report,
  decide — prefer hard-fail). Never trust archive entry names.
- **Formats**: `.zip` (via `fflate` — already a dep, used by brief 27) and
  `.tar` / `.tar.gz`/`.tgz`. For tar, prefer the image's real `tar` binary via
  `execa` (array args, `cwd` = jailed dir) — it handles gzip + streaming without
  a new dep; validate the extraction path jail still applies (extract into a
  jailed temp/dest, and for `tar` pass `--no-same-owner`, `-C <jailed dest>`, and
  reject after listing if any member escapes). If a pure-JS path is used instead,
  the same per-entry containment check applies.
- **Resource caps (zip-bomb guard)**: cap total uncompressed size and entry
  count; abort past the cap with a clear error. Don't read whole archives into
  the heap where avoidable (stream/iterate).
- **Authed by default** (global guard); mutating routes get Origin/CSRF.
- **Wire into the file-manager context menu**: right-click a `.zip`/`.tar.gz` →
  "Extract here" / "Extract to…"; right-click a selection → "Compress to .zip".
  (Controller edits `apps/add-ons/file-manager/` — that's a shared surface.) The
  `archive-manager` window is a light progress/notification + optional
  archive-contents preview; extraction completion fires a `notify(...)`.

## Fix

**Backend** `apps/backend/src/modules/archive/`: `archive.module.ts` (imports
`FilesModule`), `archive.controller.ts` (`@Controller('archive')`),
`archive.service.ts` (format detect; zip via fflate with per-entry jail check;
tar/tgz via execa `tar` into jailed dest, post-list membership check; size/count
caps), `dto/archive.dto.ts`. Routes:
- `POST /api/archive/extract`  { root, path, dest }        → extract, jailed
- `POST /api/archive/compress` { root, paths[], dest, format } → zip|targz
Register in `app.module.ts`. Jest unit tests: **zip-slip entry rejected**,
absolute-path entry rejected, symlink-escape rejected, size/count cap trips,
happy-path round-trip. Keep backend test/lint green.

**Frontend**: `apps/add-ons/archive-manager/` (small window: progress, contents
list, result) + **controller** adds the context-menu items in the file-manager
(Extract/Compress) calling the routes via core `api`, and fires `notify` on
completion.

## Must preserve (regression surface)

- **Zip-slip / path-traversal impossible**: every written path re-validated
  against the jail; `-`-leading and absolute entry names handled; symlink entries
  can't escape. The security review will feed it a malicious archive.
- File-manager context-menu edit is additive — existing menu items unchanged.
- Auth on every route; backend tests + lint green.
- Large archives don't OOM (caps + streaming).

## Verify bar

`turbo typecheck`, backend + add-on + file-manager lint/format green,
`backend#test` green (incl. zip-slip tests), `turbo build` ok. **Adversarial
security review** (zip-slip, absolute/`..`/symlink entries, zip-bomb, tar
`--absolute-names`, path with NUL) — findings fixed before commit. **Human-gated:**
extract a real zip + tar.gz, compress a selection, malicious archive is refused.

## Invariants

Unprivileged, jailed FS, auth everywhere — load-bearing. Lightweight: no new dep
(fflate present; tar is the image's binary). Identity locked.

## Out of scope

`.rar`/`.7z`/`.bz2`/`.xz` (unless trivially free via `tar`), encryption/passwords,
split archives, in-place archive editing, streaming download of a
just-built archive (build to FS, then the normal download path).

## Outcome (2026-07-18) — Wave D commit `4be1777`

Shipped. Backend `apps/backend/src/modules/archive/` (`POST extract`/`compress`,
authed): zip via `fflate` (every entry re-validated through `resolveSafe` before
any byte is written — zip-slip impossible; a hand-rolled central-directory parser
enforces caps pre-inflation), tar/tar.gz via the image's `tar` through `execFile`
(array args, no shell, `--no-same-owner`, never `--absolute-names`) into a fresh
jailed temp with a post-extraction realpath walk rejecting escaping symlinks.
Caps: entry-count + per-entry + total-uncompressed, plus (hardening) a
ratio-bounded pre-inflation cap that kills the forged-header amplification DoS
(387 B declaring 512 MiB), and a hardlink (`nlink>1`) guard removing the
tar-binary dependency. Frontend `apps/add-ons/archive-manager/` + file-manager
context-menu "Extract here"/"Compress to .zip" (controller-wired). 13 unit tests
(incl. the amplification regression). **Security review: no traversal/symlink/
hardlink escape exploitable**; the Medium amplification-DoS + Low hardlink
findings fixed. Used `execFile` not `execa` (execa is ESM; jest is CJS — same
no-shell guarantee). No new dep. `multiInstance: false`. Human-gated: extract a
real zip + tar.gz, compress a selection, malicious archive refused.
