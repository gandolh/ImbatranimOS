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
