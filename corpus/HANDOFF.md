# HANDOFF — full-auto backlog run (paused 2026-07-17)

Paused near a quota limit mid-run. This file is the resume point. A fresh
session should read this first, then `corpus/routing.md` + `wiki/status.md`.

## What the run is

User asked: **"go full auto with the remaining todos"** via the personal-skills
`orchestrate` skill. Scope chosen by the user: **"Everything actionable"** —
brief 31 + PERF-6 xlsx + all 13 daily-driver apps, in dependency waves, one
commit per brief. **Excluded** (human-gated, do NOT build autonomously): SEC-9
(`csp-connect-src-ws-wildcard`), SEC-10 (`kiosk-no-sandbox`), and brief 15's
v1-release remainder.

## DONE and COMMITTED (code on `main`)

| Brief | Commit | What |
|---|---|---|
| 31 virtualize-long-lists | `e8652b5` | TanStack Virtual: ProcessTable + FileList via core `useVirtualList`; core `ScrollArea` gained `viewportRef` |
| 32 xlsx-offthread-worker (PERF-6 xlsx slice) | `e37bdd3` | ExcelJS round-trip moved into a lazy module Web Worker (`apps/add-ons/sheets/src/engine/xlsxWorker.ts`); bridge signatures unchanged; onerror/onmessageerror backstop |
| 33 eager-bundle-lazy-load | `0341230` | Every app component `React.lazy` + `<Suspense>` in WindowContainer; eager index gzip **399.6 KB → 121.5 KB (−69.6%)**; contract widened; snipping-tool `APP_NAME` extracted to `appName.ts` |

All gates were green at each commit (`turbo typecheck` 13/13, `lint` 14/14,
`format:check`, `build`). Working tree is clean except untracked corpus docs
(the brief specs below + this file).

## Resume progress (2026-07-18)

- **Briefs 31/32/33 bookkeeping — DONE.** Moved to `done/` with Outcome notes,
  status rows + summary refreshed, log appended, todos marked `promoted`, index
  regenerated, corpus lint OK. Committed `docs(corpus)` (`89f0a01`).
- **Brief 34 notification-center — DONE + committed** (`82c635b` code; corpus
  bookkeeping in the following `docs(corpus)`). CORE surface: `notify()` on the
  public barrel, tray bell + history popover, bottom-right toasts, DnD.
- **Wave C (briefs 35–40) — DONE + committed** (`a7632ab` code; corpus
  bookkeeping in the following `docs(corpus)`). Six daily-driver apps built by a
  6-agent parallel batch, integrated serially. Desktop now 19 apps. Clock +
  calendar are the first notification-center callers.
- **Wave D (briefs 41–44) — DONE + committed** (`4be1777` code; corpus
  bookkeeping in the following `docs(corpus)`). Monaco code-editor + three authed
  backend modules (git / http-proxy / archive), built by a 4-agent opus batch,
  then 3 adversarial security reviews (no exploit) + 4 hardening fixes. Desktop
  now 23 apps, 126 backend tests. SSRF stance recorded in decisions.md.
- **Next task: Wave E — platform surfaces (briefs 45–46).** Both are CORE:
  - **45 global-search-launcher** — extend the command palette's
    `CommandSourcesRegistry` (do NOT fork it); a backend FS file/content search
    endpoint (jailed via `resolveSafe`, authed; decide live-grep vs index).
    Anchor near the Start button.
  - **46 addon-manager** — CORE; per-user enable/disable of bundled apps,
    persisted; filter `APP_REGISTRY` in ONE place (Start/palette/openWith). Some
    apps non-disable-able (Settings/Files/Terminal). Pairs with brief-33 lazy-load
    (disabled apps cost nothing).
  After Wave E the whole "everything actionable" scope is complete except the
  human-gated exclusions (SEC-9, SEC-10, brief-15 v1 remainder).

### (superseded) original Wave D plan
- **Was: Wave D — heavy/backend apps (briefs 41–44).** These need real
  care (senior/opus for the hard slices):
  - **41 code-editor (Monaco)** — HARD. Monaco MUST stay a lazy chunk (its own
    dynamic import inside the already-lazy shell). Multi-tab/file, find/replace,
    real FS via the shared kit. LSP out of scope.
  - **42 git-gui** — HARD. NEW NestJS backend module running `git` as
    unprivileged `imbatranim` inside the home-FS jail; authed like every route.
    Scope: status/stage/commit/diff/log for one repo; push/pull later.
  - **43 rest-api-client** — HARD. Backend proxy route (authed, **SSRF-aware** —
    see wiki/decisions.md security posture); collections/history in FS. Lazy.
  - **44 archive-manager** — Medium-hard. zip + tar.gz extract/compress inside
    the home-FS jail; wire into file-manager context menu; heavy work off-thread
    (worker or backend real `tar`/`unzip`).
  Two of these (42, 43) add BACKEND surface → auth on every route/WS is
  load-bearing; the controller owns backend module wiring + gates (backend has
  80 unit + e2e jest tests — keep them green). Conflict rule still applies:
  manifest.ts / openWith.ts / package-lock / backend app module are
  controller-serialized.
- **Note:** `npm install` shows 4 moderate audit advisories (pre-existing
  transitive dev deps); not gating, flagged for a later audit pass.

## REMAINING WORK (not started)

Brief numbers continue from 34. Suggested order (dependencies noted):

**Wave B tail — foundation (do next):**
- **34 notification-center** — CORE surface (not an add-on). Public notification
  API in `apps/core/src/index.ts` (toasts + persistent history panel + DnD),
  tray-anchored (Win7-classic). Clock alarms / calendar reminders / archive
  extract / large saves are the first callers. In-session only (no bg daemon).
  Todo: `todos/notification-center.md`. Build this before Wave C so clock/calendar
  can hook it.

**Wave C — light client-side apps (independent, parallelizable):**
- **35 calculator** (`todos/calculator-addon.md`) — pure client; basic + optional
  programmer mode. Easy → junior/sonnet.
- **36 clock** (`todos/clock-addon.md`) — time/world/stopwatch/timer; alarms hook
  notification-center. Easy.
- **37 image-viewer** (`todos/image-viewer-addon.md`) — next/prev/zoom/rotate;
  register in `openWith.ts`; may reuse snipping-tool annotation stack. Medium.
- **38 media-player** (`todos/media-player-addon.md`) — native `<audio>`/`<video>`,
  range-stream from FS API; register in `openWith.ts`. Medium.
- **39 markdown-previewer** (`todos/markdown-previewer-addon.md`) — reuse existing
  `react-markdown`/`remark-gfm` (already in notepad) + rehype; sanitize HTML;
  shared add-on kit. Medium. (Decide: standalone vs mode of code-editor.)
- **40 calendar** (`todos/calendar-addon.md`) — month/week, events in FS/store;
  decide Todo-app integration; reminders hook notification-center. Medium.

**Wave D — heavy / backend apps:**
- **41 code-editor (Monaco)** (`todos/code-editor-monaco.md`) — HARD → senior/opus.
  Monaco MUST be a lazy chunk (brief 33 pattern already makes shells lazy; keep
  Monaco's own import dynamic inside). Multi-tab/file, find/replace, real FS.
  Reuse shared add-on kit. LSP is out of scope.
- **42 git-gui** (`todos/git-gui-addon.md`) — HARD. New NestJS backend module
  running `git` as unprivileged `imbatranim` inside the home-FS jail; authed like
  everything. Scope: status/stage/commit/diff/log for one repo; push/pull later.
- **43 rest-api-client** (`todos/rest-api-client-addon.md`) — HARD. Backend proxy
  route (authed; **SSRF-aware** — see `wiki/decisions.md` security posture);
  collections/history in FS. Lazy-loaded.
- **44 archive-manager** (`todos/archive-manager-addon.md`) — zip + tar.gz extract/
  compress; inside home-FS jail; wire into file-manager context menu; heavy work
  off-thread (worker or backend real `tar`/`unzip`). Medium-hard.

**Wave E — platform surfaces:**
- **45 global-search-launcher** (`todos/global-search-launcher.md`) — CORE; extend
  the command palette's `CommandSourcesRegistry` (don't fork); backend FS
  file/content search endpoint (jailed, authed; live grep vs index — decide).
  Anchor near Start button.
- **46 addon-manager** (`todos/addon-manager.md`) — CORE; per-user enable/disable
  of bundled apps, persisted; filter `APP_REGISTRY` in ONE place (Start/palette/
  openWith). Some apps non-disable-able (Settings/Files/Terminal). Pairs with
  brief 33 lazy-load (disabled apps cost nothing).

## How to resume (the working pattern that succeeded)

1. `/orchestrate` is already the front door; this run is a build backlog →
   effectively `plan-split-dispatch` master mode. You are the controller.
2. Per brief: **write the brief** in `briefs/todo/NN-*.md` from the todo's
   documented constraints + invariants (the todos already contain the grill
   answers under "Constraints to respect when grilled"). Then **dispatch a
   subagent** (`general-purpose`, `model: opus` for HARD, `sonnet` for easy) with
   the full brief + these architecture facts + explicit "run gates, do NOT
   commit, do NOT touch corpus/, stay in your files." Reviewed subagent output,
   hardened where needed, ran gates myself, committed one commit per brief.
3. New add-on = a package under `apps/add-ons/<name>/` (copy an existing one's
   `package.json`/`tsconfig.json`/`eslint.config.js` shape), exporting
   `manifest: AddonManifest` from `src/index.ts` with **lazy** component
   (`component: lazy(() => import('./X').then((m) => ({ default: m.X })))`).
   Wire it with **one import + one array entry** in
   `apps/core/src/manifest.ts` (the ONLY file allowed to import add-on packages).
   `workspaces` already globs `apps/add-ons/*`; run `npm install` once after
   creating package(s) to link `@imbatranim/core`. Register file types in
   `apps/add-ons/file-manager/src/lib/openWith.ts` when relevant.
4. **Conflict rule:** `manifest.ts`, `openWith.ts`, root `package-lock.json`, and
   `apps/core/src/index.ts` are shared — the CONTROLLER edits those + runs
   `npm install` + gates + commit. Subagents build only their own package dir.
   So new-app subagents can run in parallel; integration is serial.
5. Gates (from repo root): `npm run typecheck` (13/13 today, grows as apps land),
   `npm run lint`, `npm run format:check` (`npx prettier --write` touched files),
   `npm run build`. **Known turbo gap:** `core:build` cache key omits add-on
   `src`, so use `npm run build -- --force` when measuring bundle output.
6. Commit policy (routing.md): one commit per brief on `main`, local-only (no
   PR/CI). Corpus bookkeeping (move brief→done, status row, log) batched as
   `docs(corpus)` commits.

## Key architecture facts (verified this run)

- Monorepo: `apps/backend` (NestJS, better-sqlite3, argon2 auth, real PTY/FS),
  `apps/core` (`@imbatranim/core` — shell + shared kit; public surface is
  `src/index.ts`, deep imports forbidden by eslint), `apps/add-ons/*`.
- Shared add-on kit in core: `api` (authed axios), `fetchFileBytes`/
  `uploadFileBytes`/`downloadUrl`/`fileName`, `createOpenedFileStore`,
  `useOpenIntent`/`useSaveHotkey`/`useUnsavedGuard`, `ConfirmDialog`/`useConfirm`,
  `PromptDialog`/`usePrompt`, `useVirtualList`, UI kit (Button/Dialog/Input/
  ScrollArea(+viewportRef)/Select/Checkbox/Separator/Tooltip), `openApp`,
  window/intent stores, `cn`, `queryClient`.
- Contract (`apps/core/src/contract.ts`): `AddonManifest = AppConfig +
  commandSources?`; `component` now accepts lazy.
- Backend module shape: `apps/backend/src/modules/<name>/` with controller +
  service + module + dto, global auth guard, `@Public()` for open routes.
  Tests: 80 unit + e2e (jest). Keep backend#lint green (it just went green in
  brief 29).
- Invariants (corpus/CLAUDE.md): OS is real (real PTY/FS, nothing simulated);
  user `imbatranim`, no sudo, no privileged container; auth on every route + WS;
  lightweight is identity; Win7-classic B&W + accent locked; build-from-source.
