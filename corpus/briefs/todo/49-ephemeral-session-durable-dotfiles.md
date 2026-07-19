# Brief 49 — Ephemeral per-tab session + durable server-side dotfiles

Status: **todo** · From the 2026-07-19 OS-layering grilling (the (b) SSH-session
driver). CORE frontend + a small backend module. Independent of briefs 47/48 —
can ship in any order. Design:
[wiki/os-layering.md](../../wiki/os-layering.md#sessions-vs-dotfiles-the-one-new-decision).

## Problem

Desktop state is persisted per-**browser** in `localStorage`, which is **shared
across all tabs of one origin**. So two tabs **stomp each other's window
layout** — the opposite of the grilled "each tab = an SSH session" model. And
durable user config (wallpaper, accent, icon positions, disabled apps) lives in
`localStorage` too, so it's tied to the browser rather than the account and is
lost on a different device / cleared storage.

The grilled split fixes both:

- **Session = ephemeral, per-tab, in-memory window layout.** New tab = fresh
  desktop; close tab = its windows are gone. Nothing shared between tabs.
- **User config = durable `$HOME` dotfiles**, server-side, shared across all
  sessions like `.bashrc` across SSH logins.

## Decisions (grilled 2026-07-19)

- **Window layout becomes ephemeral.** Stop persisting `windowStore` layout to
  `localStorage` (`imbatranimos:window-layout`). Each tab holds its own in-memory
  session; **no reattach, no server-side session persistence, no GC** (tmux-style
  detach/reattach is an explicit future, not this brief). This alone ends the
  cross-tab stomp — there is no shared layout key to fight over.
- **These stores become server-backed dotfiles** (durable, shared across
  sessions): `appearanceStore` (`imbatranimos:appearance` — theme + accent),
  `wallpaperStore` (`wallpaper-storage`), `desktopStore` (`desktop-storage` —
  desktop icon positions), `addonStore` (`imbatranimos:addons` — disabled set).
  Also: pinned taskbar items *if/when* that store exists.
- **`notificationStore` history stays local/ephemeral** — it's session-scoped
  UX, not user config; leave its `localStorage` persistence (or drop to
  in-memory), do **not** promote it to a dotfile.
- **Backend = a tiny key/value prefs store** in the **existing app SQLite DB**
  (`apps/backend/src/db/db.service.ts`, better-sqlite3, lives in the `$HOME`
  volume). One table `prefs(key TEXT PRIMARY KEY, value TEXT /* JSON */,
  updated_at)`. Single user — no per-user scoping needed. Behind the global
  `SessionAuthGuard` (no `@Public()`), so dotfiles are owner-only.
- **Client persistence = hydrate-then-write-through.** On boot, fetch all prefs
  and hydrate the dotfile stores; on change, **debounced** `PUT` write-through.
  Replace each dotfile store's zustand `persist(localStorage)` with a
  server-backed persistence adapter (a custom `StateStorage` hitting the prefs
  API, or an explicit hydrate + subscribe). Optimistic local update; server is
  the source of truth on next load.
- **One-time migration nicety (optional, low priority):** on first boot with
  empty server prefs, seed from any existing `localStorage` dotfile values so a
  current user doesn't lose their wallpaper/accent. Then clear those keys.

## Fix

1. **Backend `prefs` module** — `apps/backend/src/modules/prefs/`: service over
   `db.service`, `prefs` table (create-if-not-exists on init). Controller:
   `GET /api/prefs` (→ `{ [key]: json }`), `PUT /api/prefs` (bulk upsert) and/or
   `PUT /api/prefs/:key`. Guarded (no `@Public()`). Small unit test: upsert +
   read-back + JSON round-trip.
2. **Frontend prefs client** — `apps/core/src/lib/prefs.ts`: typed
   `getPrefs()` / `setPref(key, value)` over the authed `api` client; debounce
   helper for write-through.
3. **Window layout → ephemeral** — in `windowStore.ts` delete
   `LAYOUT_STORAGE_KEY` save/load/clear (lines ~46–77 + `persistLayout`);
   sessions are in-memory only. Remove any boot-time layout restore.
4. **Dotfile stores → server-backed** — swap `persist(localStorage)` for the
   prefs-backed adapter in `appearanceStore`, `wallpaperStore`, `desktopStore`,
   `addonStore`. Hydrate on app boot (before first paint where it matters —
   accent/wallpaper — to avoid a flash), then subscribe → debounced write.
5. **Boot sequencing** — hydrate prefs once at startup (a provider/effect high in
   the tree), gate the initial theme/wallpaper apply on it to avoid FOUC.
6. *(optional)* localStorage→server seed migration + cleanup.

## Must preserve (regression surface)

- **Two tabs never stomp each other's windows** — open two tabs, arrange windows
  differently in each; neither changes the other (the (b) acceptance).
- New tab opens to a **fresh** desktop (no restored windows); closing a tab loses
  only that tab's window arrangement.
- Wallpaper, accent/theme, desktop icon positions, and the disabled-app set
  **survive a full reload and appear identically in a second tab / another
  browser** (they're server dotfiles now).
- No accent/wallpaper **flash** on load (hydrate before the gated apply).
- All prefs routes are **auth-guarded** (no unauthenticated read/write of user
  config); the SQLite DB stays in the `$HOME` volume (persists across container
  recreate).
- Add-on manager (brief 46) still toggles apps — now the disabled set is a
  dotfile, shared across tabs.

## Verify bar

`turbo typecheck`, core lint + format, `turbo build` green; backend unit test for
the prefs round-trip; full backend suite green. **Human-gated:** two-tab stomp
test (the headline (b) fix); set wallpaper/accent/icon-positions, hard-reload +
open a second tab, confirm they carry; confirm a fresh tab starts with no windows
open; confirm nothing reads/writes prefs while logged out.
