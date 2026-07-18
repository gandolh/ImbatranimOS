# Brief 45 — Global search launcher

Status: **todo** · Promotes [global-search-launcher](../../todos/global-search-launcher.md).
Wave E. CORE + a backend FS-search endpoint. Extends the existing command
palette — does NOT fork it.

## Problem

The command palette (Mod+K) searches apps only. There's no way to find a file by
name from one keystroke, and no visible launcher affordance (only the hotkey).

## Decisions (grilled 2026-07-18)

- **Extend `CommandSourcesRegistry`, don't fork.** Add a new `filesSource`
  `CommandSource` (group "Files") registered alongside `appsSource`. The palette
  already runs sources in parallel and merges — one more source is the whole
  frontend change.
- **Backend FS search endpoint**, jailed + authed like the rest of Files:
  `GET /api/files/search?root=&query=&content=` → bounded list of `{ path, name,
  type }`. Reuse `FilesService.resolveSafe` for the root; walk under it.
  - **Filename match** by default (case-insensitive substring).
  - **Optional content grep** (`content=1`): scan text files' contents, skipping
    files over a size cap and obvious binaries; still filename-jailed.
  - **Bounded**: max results (e.g. 100), max entries scanned / max depth, a
    wall-clock budget, and skip `node_modules`/`.git`/dotdirs by default — so a
    search can't walk the whole disk or hang. Live walk (no index) for v1;
    note indexing as a future option.
- **Activation** opens the file's **containing folder in File Manager**,
  navigating to it (add a lightweight `{ navigatePath }` open-intent that
  file-manager consumes on mount). Directories navigate directly.
- **Visible launcher**: a Search button in the taskbar next to Start that opens
  the palette (same component, `paletteOpen`), so search is discoverable without
  knowing Mod+K. Anchor near the Start button per the Win7-classic identity.

## Fix

1. **Backend** `FilesService.search(root, query, { content })` — jailed bounded
   walk (skip heavy dirs, caps on results/entries/time; content grep with a
   per-file size cap + binary skip). `FilesController` `@Get('search')` with a
   `SearchQueryDto` (class-validator). Unit tests: filename hit, content hit,
   jail holds, caps trip, heavy-dir skip.
2. **Frontend** `shared/commands/filesSource.ts` — `CommandSource` querying
   `/files/search` (debounced by the palette's own input), returning file items;
   `activate` → `openApp('file-manager', { navigatePath: dir, root })`. Register
   it in `manifest.ts`'s source-registration loop (next to app sources) or in the
   palette bootstrap.
3. **file-manager**: consume a `{ navigatePath, root }` open-intent on mount
   (set initial `root` + `path`), so activation reveals the file's folder.
   (Controller edits file-manager.)
4. **Taskbar**: a Search button beside Start that toggles the palette (lift
   `paletteOpen` or expose an opener). Token-styled, `Search` icon.

## Must preserve (regression surface)

- The palette's existing app search + Mod+K unchanged; `filesSource` is additive
  and errors are swallowed (a failed source is skipped — existing behavior).
- Search endpoint is authed (global guard) + jailed (`resolveSafe`); it can never
  read outside the root, and is bounded so it can't DoS the box.
- Opening a search result doesn't regress editor open-intents (`openPath` still
  works; `navigatePath` is a separate field file-manager reads).

## Verify bar

`turbo typecheck`, core + file-manager + backend lint/format green, `backend#test`
green (new search tests), `turbo build` ok. **Security-adjacent** (jail + bounds
on the walk) — keep it tight. **Human-gated:** Mod+K or the Search button →
type a filename → results appear → activating reveals it in Files; content search
finds a string; a huge dir doesn't hang.

## Invariants

Auth everywhere + jailed FS (the endpoint). Lightweight (live walk, bounded; no
index daemon). Identity locked (palette + a Win7 tray/Start-area button). Extends
the registry, no fork.

## Out of scope

A persistent search index / watcher daemon, fuzzy ranking beyond substring,
search inside archives/office binaries, regex search, cross-root search in one
query (pick a root), preview in the palette.

## Outcome (2026-07-18) — Wave E commit `3e72333`

Shipped. Backend `GET /api/files/search?root=&query=&content=` (authed, jailed):
`FilesService.search` resolves the root once via `resolveSafe`, walks from there
joining only dirent names (never `..`), **never follows symlinks** (skip → no
escape, no cycles), and is bounded — maxResults 100 / maxEntries 20k / maxDepth
12 / 3 s budget (all `FILES_SEARCH_*`-overridable), returning `truncated` past any
cap; skips `node_modules`/`.git`/dot-dirs; optional content grep reads text files
under a 256 KB cap with a NUL-sniff binary skip. `SearchQueryDto` (class-validator)
+ 9 security/behaviour tests (jail, symlink-not-followed, caps, skips). Frontend:
`filesSource` command source (group Files, errors swallowed), `paletteStore`
(App.tsx refactored to it so Mod+K + the new Taskbar Search button share state),
a Taskbar Search button, and a file-manager `{ navigatePath, root }` open-intent
(StrictMode-safe) that reveals a hit's folder — separate from the editors'
`openPath`. Extends `CommandSourcesRegistry`, no fork. No new dep. Gates green
(FE typecheck 23/23 + lint + build; BE build + tests 135/135 + lint). Human-gated:
Search button / Mod+K → filename + content hits → activating reveals in Files;
big dir doesn't hang.
