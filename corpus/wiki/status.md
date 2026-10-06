---
summary: Current snapshot (2026-10-06) — identity is Ward's in the estate and a local single-owner sign-in without it (brief 152); briefs to 155 done bar 15 (parked), including 50 (the Browser) and 120 (the app marketplace, browser walk still owed); a server-ISO brief deferred (work stays in Docker for now); owner-run items listed. History to 2026-08-06 is in status-history.md.
updated: 2026-10-06
---

# Status — 2026-10-06

**Phase: the web-OS is built and in daily use inside the Ward estate.** One
container is the computer: Alpine + Node, the desktop and the API on one port,
everything as the unprivileged `imbatranim` user, home in a named volume
([architecture.md](architecture.md)). The narrative up to 2026-08-06, with the
metrics recorded then, is in [status-history.md](status-history.md). Every
change since is in [log.md](../log.md).

## Identity

- **Inside the estate, Ward** (since 2026-09-06): an `imbatranim-os` grant
  opens the desktop. The desktop refreshes its 15-minute token ahead of time
  (brief 144), and open terminals survive the rotation (brief 145).
- **Without Ward, a local sign-in** (brief 152, 2026-10-04):
  - a single owner claims the machine on first visit, optionally gated by
    `SETUP_TOKEN`;
  - scrypt hashes, an `imb_session` cookie whose hash is stored, per-address
    backoff;
  - a restore ends every local session.
  - The README's `docker run` boots into it again; before brief 152 it crashed
    at config validation.
- **Cover screen** hides the desktop and is not a lock.
- Decisions: [decisions-estate-era.md](decisions-estate-era.md).

## Every brief to 46, one line each

Later briefs (47–155) are one entry each in [log.md](../log.md); the open ones are below.

| # | Brief | State | One-liner |
|---|---|---|---|
| 01–07 | ISO era | superseded | Full installable-distro path; record in briefs/superseded/ + log |
| 08 | [fork-bootstrap](../briefs/done/08-fork-bootstrap.md) | **done** | Imported + pruned minimal-web-desktop; dev loop verified |
| 09 | [container-image](../briefs/done/09-container-image.md) | **done** | Dual-mode Dockerfile; one port, imbatranim user, volume home verified; image 364MB (over target — revisit flagged) |
| 10 | [auth](../briefs/done/10-auth.md) | **done** | Sessions (argon2id + httpOnly cookie), first-run wizard, optional TOTP, login throttle, global guard + WS validator; HTTPS = Caddy reverse proxy (decided) |
| 11 | [terminal-app](../briefs/done/11-terminal-app.md) | **done** | Real WS PTY at /api/pty (auth on upgrade, backpressure, revocation sweep); old repl module deleted; multi-instance Terminal app |
| 12 | [files-app](../briefs/done/12-files-app.md) | **done** | Home-root FS API (traversal/symlink jail, tested) + explorer UI with tree/context menu/upload/download |
| 13 | [system-monitor](../briefs/done/13-system-monitor.md) | **done** | Live CPU/RAM/disk/processes + About; uid-scoped kill; app-install stance recorded |
| 14 | [imbatranim-reskin](../briefs/done/14-imbatranim-reskin.md) | **done** | Win7-classic taskbar/start/tray/icons, B&W tokens, dark default, hourglass logo; accent = 4 presets, crimson provisional (user pick pending) |
| 15 | [v1-release](../briefs/todo/15-v1-release.md) | in progress | Engineering DONE (security pass, 413/headers/repl_configs fixes, README, 1.0.0 stamp, container verified + numbers); human-gated remainder: friend QA, VPS deploy, accent pick, dep bumps, tag |
| 16 | [turborepo](../briefs/done/16-turborepo.md) | **done** | npm workspaces + turbo 2.10.5, single root lockfile, phantom tailwind deps rehomed; envMode loose + prettier pin 3.8.3 (see log); image 385MB, FULL TURBO ✓ |
| 17 | [os-restructure](../briefs/done/17-os-restructure.md) | **done** | apps/{backend,core,add-ons/*}; 7 add-on packages, manifest.ts composition root, eslint-enforced boundary; browser-verified (found+fixed Tray stats crash); backend lint debt remains |
| 18 | [alpine-kiosk-iso](../briefs/superseded/18-alpine-kiosk-iso.md) | **done** (QEMU-verified) | Post-v1 kiosk ISO: `./build iso` (nob.h build.c → Docker → mkimage, unprivileged/fakeroot) makes a 580 MiB hybrid BIOS+UEFI diskless ISO. App ships as a signed custom `.apk` (musl-compiled native addons); greetd autologin → cage + chromium --kiosk → the web UI off the local backend. **KVM-booted into the fullscreen first-run login, no console/shell** (screenshot-verified); RAM floor 2 GB. Human-gated: UEFI live boot + VirtualBox/Hyper-V + real HW + interactive terminal/files walkthrough |
| 19 | [office-viewers](../briefs/done/19-office-viewers.md) | **done** | PDF Viewer (pdfjs-dist) + Slides (pptx-preview — spike passed on a real 11-slide deck); file-manager ext→app map (lib/openWith.ts) drives double-click/Enter/context menu; engines lazy chunks |
| 20 | [office-editors](../briefs/done/20-office-editors.md) | **done** | Sheets (Univer + ExcelJS bridge — SheetJS CE failed the styling spike, user-approved engine revisit) + Docs (SuperDoc + docx normalizer fixing a silent-save-loss defect); AGPL-3.0 relicense landed; explicit Save, dirty •, close guard, New→Spreadsheet/Document |
| 21 | [snipping-tool](../briefs/done/21-snipping-tool.md) | **done** | Flameshot-style capture via html-to-image (spike passed incl. xterm content), dim+crosshair region/Enter/Esc flow, 5 annotation tools + undo, Save to ~/Pictures/Screenshots / Copy / Download; rasterizer lazy |
| 22 | [file-preview-pane](../briefs/done/22-file-preview-pane.md) | **done** | Explorer-style toggleable preview pane in file-manager: text/images/AV native, metadata-card fallback, 1 MB text cap, persisted width/toggle, auto-collapse; zero new deps |
| 23 | [shared-addon-kit](../briefs/done/23-shared-addon-kit.md) | **done** | Deduped the office/add-on spine into `@imbatranim/core` (fileBytes/downloadUrl/fileName, `createOpenedFileStore`, `useOpenIntent`/`useSaveHotkey`/`useUnsavedGuard`, `ConfirmDialog`/`useConfirm`); 4 doc add-ons dropped local fileBytes+openedFileStore copies, native `confirm()` gone from add-ons; net −333 LOC, all gates green + 2-finder review. Human-gated: in-browser walkthrough |
| 24 | [window-render-perf](../briefs/done/24-window-render-perf.md) | **done** | PERF-1: memoized `Window` + per-window store selector + `useShallow` container list + `ResizeHandle` reads `getState()`; only the moving window re-renders during a drag (no app subtree reconciles). Gates green. Human-gated: in-browser drag feel |
| 25 | [notes-filesservice-dedup](../briefs/done/25-notes-filesservice-dedup.md) | **done** | CS-7: backend `notes` collapsed to `/notes/recent`; Notepad now uses `/files?root=notes`; 3 duplicate DTOs + FilesService delegation removed. `createFile` now upsert. 80 unit + 29 e2e green. Human-gated: Notepad walkthrough |
| 26 | [filemanager-split](../briefs/done/26-filemanager-split.md) | **done** | CS-3: FileManager 752→531 lines; extracted useFileSelection/useFileClipboard/useDeleteFlow (delete states → one union, CS-4 preserved)/usePaneResize/useListKeyboardNav + buildMenuItems. Behavior review clean. Human-gated: walkthrough |
| 27 | [docx-offthread-unzip](../briefs/done/27-docx-offthread-unzip.md) | **done** | PERF-6 (docx slice): docxNormalize uses fflate async `unzip`/`zip` (off-thread), identical output. Xlsx/ExcelJS worker slice still open in the todo. Human-gated: large-docx open feel |
| 28 | [first-run-setup-token](../briefs/done/28-first-run-setup-token.md) | **done** | SEC-2: opt-in `SETUP_TOKEN` (default-off no-op) gates first-run claim with a constant-time compare; `/auth/status` advertises it, wizard asks when required. 80 unit + 34 e2e. Human-gated: token deploy |
| 29 | [backend-lint-typing](../briefs/done/29-backend-lint-typing.md) | **done** | Paid the backend `no-unsafe-*` lint debt (typed sqlite rows + pty/main/test typing). **`backend#lint` + root `npm run lint` now green (0/0)** — the last standing lint red is gone |
| 30 | [addon-polish](../briefs/done/30-addon-polish.md) | **done** | Notepad StrictMode-safe intent drain; new core `PromptDialog`/`usePrompt` replaces native `prompt()`; dropped 4 dead `zustand` deps (+ lockfile). Human-gated: notepad walkthrough |
| 31 | [virtualize-long-lists](../briefs/done/31-virtualize-long-lists.md) | **done** | PERF: virtualized ProcessTable (re-renders every 1.5s) + FileList (large dirs) with `@tanstack/react-virtual`, centralized in core via a `useVirtualList` helper + `ScrollArea` `viewportRef`; keyboard nav `scrollToIndex`, scroll stable across refetch. Human-gated: kiosk feel-check |
| 32 | [xlsx-offthread-worker](../briefs/done/32-xlsx-offthread-worker.md) | **done** | PERF-6 (xlsx tail): whole ExcelJS round-trip moved into a lazy Vite module worker (`sheets/src/engine/xlsxWorker.ts`), request-id correlation + transferable buffers; bridge signatures unchanged so `Sheets.tsx` untouched; exceljs now off the main thread's module graph. Human-gated: large-xlsx responsiveness |
| 33 | [eager-bundle-lazy-load](../briefs/done/33-eager-bundle-lazy-load.md) | **done** | PERF: every app shell + Settings now a `React.lazy` boundary, `<Suspense>` in WindowContainer, contract widened; eager `index-*.js` gzip **399.6 KB → 121.5 KB (−69.6%)**, app code emits as per-app chunks. Trigger for Monaco. Human-gated: open-flash/first-paint |
| 34 | [notification-center](../briefs/done/34-notification-center.md) | **done** | CORE platform surface: persist-backed notification store + public `notify()` on `@imbatranim/core`, bottom-right auto-dismiss toasts (errors sticky), tray bell + unread badge + history popover (mark-all-read / clear-all / DnD). Session-only toasts, history bounded 100, no new deps. First callers = clock alarms (36) + calendar reminders (40). Human-gated: walkthrough |
| 35 | [calculator](../briefs/done/35-calculator.md) | **done** | Wave C. Basic (shunting-yard, no `eval`) + Programmer mode (BigInt 64-bit, HEX/DEC/OCT/BIN + bitwise/shift). Keyboard, window-scoped. Own lazy chunk. No new deps. Human-gated: feel-check |
| 36 | [clock](../briefs/done/36-clock.md) | **done** | Wave C. World clocks (Intl), stopwatch, timer, alarms; timestamp-driven (no drift), persisted. Alarm/timer → `notify()` (first notification caller), "only while open" note. No new deps. Human-gated: accuracy/fire |
| 37 | [image-viewer](../briefs/done/37-image-viewer.md) | **done** | Wave C. Root-aware `<img>` via `downloadUrl`, zoom/fit/rotate, folder prev/next (own `listDir`), keyboard. Registered png/jpg/jpeg/gif/webp/bmp/svg/avif/ico → openWith. No new deps. Human-gated: open/next/zoom |
| 38 | [media-player](../briefs/done/38-media-player.md) | **done** | Wave C. Native `<audio>`/`<video>` range-streamed via `downloadUrl` (no buffering), custom transport, folder queue + auto-advance, remount-per-track (no leaks). Registered 8 audio + 6 video exts. No new deps. Human-gated: playback/seek/queue |
| 39 | [markdown-editor](../briefs/done/39-markdown-previewer.md) | **done** | Wave C. Split-view md editor (react-markdown + remark-gfm, **no rehype-raw** = XSS-safe), full save flow (open intent / save hotkey / unsaved guard). `md`+`markdown` reroute from notepad (any root). No new deps. Human-gated: open/edit/save |
| 40 | [calendar](../briefs/done/40-calendar.md) | **done** | Wave C. Month + week views, persisted events (own store, no backend), reminders → `notify()` (second caller), "only while open" note. Todo coupling deferred. No new deps. Human-gated: CRUD/nav/reminder |
| 41 | [code-editor](../briefs/done/41-code-editor-monaco.md) | **done** | Wave D. Monaco, self-hosted (no CDN, workers via Vite `?worker`), fully lazy — eager bundle unchanged; multi-tab, find/replace, real-FS save. Code exts reroute here (notepad keeps txt/log). Deps: monaco-editor + @monaco-editor/react (lazy). Human-gated: open/tabs/save |
| 42 | [git-gui](../briefs/done/42-git-gui.md) | **done** | Wave D. Backend git module: execa array-args (no shell, `--` guard, LITERAL_PATHSPECS, jailed cwd, work-tree + top-level-in-jail check), status/stage/commit/diff/log; authed. 20 tests. **Security-reviewed** (no exploit; LOW ancestor-.git closed). No new dep. Human-gated: real repo ops |
| 43 | [rest-api-client](../briefs/done/43-rest-api-client.md) | **done** | Wave D. Owner-authed backend HTTP proxy — scheme allowlist per redirect hop, size/timeout/redirect caps, cookie/auth never leaked (+cross-host strip). Collections in home FS. 13 tests. **Security-reviewed** (safe as-is). SSRF stance in decisions.md. No new dep. Human-gated: send/persist |
| 44 | [archive-manager](../briefs/done/44-archive-manager.md) | **done** | Wave D. zip (fflate) + tar.gz (tar/execFile) extract/compress, every entry re-validated via `resolveSafe` (zip-slip-proof), temp+realpath walk, ratio-bounded caps (amplification-DoS fix) + hardlink guard; file-manager context menu. 13 tests. **Security-reviewed** (Medium+Low fixed). No new dep. Human-gated: extract/compress |
| 45 | [global-search-launcher](../briefs/done/45-global-search-launcher.md) | **done** | Wave E. CORE. Jailed+bounded backend FS search (`/api/files/search`, no symlink follow, caps + truncated, content grep opt-in), 9 tests; palette "Files" source + Taskbar Search button (palette store) + file-manager navigate-intent. Extends the palette, no fork. No new dep. Human-gated: search/reveal |
| 46 | [addon-manager](../briefs/done/46-addon-manager.md) | **done** | Wave E. CORE. Persisted per-user disabled-set + single `enabledApps` filter (Start/palette/Desktop), `openApp` guard, Settings "Apps" section; runtime keeps full registry; Settings/Files/Terminal non-disableable. No new dep. Human-gated: disable/enable/reload |

Dependency order: 08 ✓ → 09 ✓ → 10 ✓ → {11 ✓, 12 ✓, 13 ✓} → 14 ✓ → 15
(human-gated remainder). Restructure chain: 16 ✓ → 17 ✓. The post-v1
backlog (18 kiosk ISO, 19 → 20 office suite, 21 snipping tool, 22
preview pane) all landed 2026-07-17 in one orchestrated run — waves
{21 ‖ 22 ‖ 18-long-lane} → 19 → 20, one commit per brief, plus a
3-finder review pass whose confirmed findings were fixed and committed.
Captures in todos/: lint debt, office shared-helpers reuse debt,
notepad StrictMode intent bug.

## Open briefs

| # | Brief | State |
|---|---|---|
| 15 | [v1-release](../briefs/todo/15-v1-release.md) | **parked** by the owner (2026-10-04): needs a friend's install and a real deploy |
| 50 | [web-browser-proxied](../briefs/done/50-web-browser-proxied.md) | **done** (2026-10-04): the Browser, on its own proxy origin; security-reviewed; human checks left: search past a CAPTCHA, audio, a real site sign-in across a restart |
| 120 | [app-marketplace-install-from-url](../briefs/done/120-app-marketplace-install-from-url.md) | **done** (2026-10-06): the in-repo catalog installs apps from other repos at pinned commits, built on the machine, mounted natively; security-reviewed; owed: a browser walk in the dev container, and a game that exports `mount` (game-engine repo) |
| — | the server ISO | **deferred** by the owner (2026-10-04): work stays in the Docker container for now. When written: a plain Alpine image with the server pre-installed, reached from the LAN over HTTPS; replaces the kiosk ([brief 18](../briefs/superseded/18-alpine-kiosk-iso.md), superseded) |

## Owed by the owner

- Delete the old local development database at `data/db.sqlite` in the repo
  root (gitignored). It is from before the Ward move and still holds the old
  password hash; the agent's delete was blocked by its permission check.
  Delete any old downloaded `imbatranim-home-*.tar.gz` backups too
  (decisions-estate-era.md: start fresh).
- Brief 120's browser walk in the Docker dev container: Settings →
  Marketplace, install a test app, open it, uninstall. The agent could not
  sign in there: the dev volume's local owner has a password from an earlier
  session that is gone, and clearing it was refused by the permission check.
  The README's lock-out procedure resets it.
- For brief 120's own gate: a build of a game (Hollow first) that bundles it
  into one ES module exporting `mount` / `unmount`, in the game-engine repo,
  and a descriptor here pinning that commit.
