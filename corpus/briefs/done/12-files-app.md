# Task 12 — Files app: the real filesystem in a window

## Context

Second pillar of the real-OS claim. An explorer over `/home/imbatranim`
(the volume — the user's actual computer). Depends on 08/09/10; the fork's
notepad/file services may partially overlap — reuse, don't duplicate.

## Files you OWN

- Backend FS API (list/stat, rename, move, delete, mkdir, upload,
  download; path-traversal-proof, scoped to the home dir by default)
- Frontend Files app (tree/list panes, drag-drop upload, context menu:
  rename/delete/new folder, download)

## What to do

1. FS endpoints acting as the container user, home-scoped with explicit
   normalization + jail checks (no `..`, no symlink escape).
2. Explorer UI in the fork's window framework; Windows-explorer-flavored
   layout (full skin lands with brief 14).
3. Upload (multipart, size-capped) and download (streaming) of real
   files.
4. Wire-in with notepad: open a text file from Files in the notepad app
   if the integration is cheap; note it as future work if not.

## Acceptance

Files created in the browser appear via `ls` in the Terminal app (and
vice versa); upload/download round-trips a binary file intact; deliberate
traversal attempts (`../../etc/passwd`, encoded variants, symlinks out)
are refused with tests proving it; all endpoints require auth.

---

**Outcome (2026-07-17):** DONE. `files` module extended (not duplicated):
new `home` root (FILES_ROOT env, default os.homedir → /home/imbatranim in
container) alongside `notes`; REST surface under /api/files (list, stat,
content, download stream, multipart upload capped 100MB via
FILES_MAX_UPLOAD_BYTES, mkdir, move, copy, delete). Jail: decode-loop +
NUL reject + re-root strip + lexical containment + realpath symlink checks
incl. missing-target ancestor walk — 12 unit + 6 e2e tests prove refusals.
Frontend file-manager: tree/list panes, root switcher, context menu,
notepad wire-in via openApp intent (notes root only — home-root notepad is
future work). Known nit: over-cap upload surfaces as 500 not 413 (brief 15
fix list).
