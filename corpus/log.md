# Log

## [2026-07-16] decision | Architecture locked after research + grilling session

Researched four paths (MS-DOS base, Windows debloat wizard, Ubuntu/Arch
remix, from-scratch) and grilled every branch. Locked: minimal Ubuntu LTS
base, LXQt on X11 for v1 (labwc/Wayland + custom shell as v2 path),
Flatpak/no-snap, ~10-app curated preinstall, ISO-releases-only updates,
scripted debootstrap + live-build with local-only runs (no CI), Calamares,
visible branding + custom Qt Welcome app, friend-install bar as the v1
finish line. Full record in [wiki/decisions.md](wiki/decisions.md).

## [2026-07-16] maintenance | Corpus bootstrapped

Created the corpus skeleton (CLAUDE.md, index, routing, lint, wiki spine)
and seeded the wiki from the session's findings. Repo was empty before this.

## [2026-07-16] decision | Build-tech grilling: pipeline, language, versions, theming, host

Second grilling session resolved every technical unknown: hand-rolled
4-step pipeline (debootstrap/chroot/mksquashfs/xorriso) with AnduinOS as
reference; **build.c on tsoding's nob.h** driving versioned `.sh` chroot
steps (hybrid shape); **Ubuntu 26.04 LTS** (LXQt 2.3/Qt6/Kvantum); SDDM +
PipeWire + NetworkManager; theming = forked Fluent skeleton + ImbatranimOS
identity layer (from-scratch identity considered, deferred — same shape as
the labwc deferral); Welcome app in QML; KDE Discover Flatpak-only;
**privileged Docker on WSL2** as build host with Hyper-V VM fallback.
Details in [wiki/decisions.md](wiki/decisions.md); resolved items cleared
from [wiki/open-questions.md](wiki/open-questions.md).

## [2026-07-16] decision | Product/UX grilling: layout, identity, boot, updates, distribution

Third grilling closed every documentation gap: Win7-classic layout in
modern flat (not Aero), desktop icons + Win-key + Windows shortcuts,
2GB-with-zram floor (4GB rec), hybrid UEFI+BIOS ISO, Secure Boot via
Ubuntu shim, dual-boot supported, notify+one-click updates, English-only
v1, VLC, B&W retro-simple identity with parameterized accents (mockup
pick inside brief 03), semantic versioning, build-from-source
distribution (clone + build, ISO in dist/), Welcome app = tour + status
check. Full record in [wiki/decisions.md](wiki/decisions.md).

## [2026-07-16] todo | Briefs 01-07 filed — the complete v1 path

Filed seven briefs decomposing v1: 01 build-scaffold, 02
desktop-experience, 03 identity-theming, 04 app-layer, 05 installer, 06
welcome-app, 07 v1-release. Dependency order and one-liners in
[wiki/status.md](wiki/status.md). scaffold-iso-build todo marked promoted
into brief 01.

## [2026-07-16] done | Brief 01 (partial) — pipeline proven, then superseded mid-flight

Before the pivot landed: the gate smoke test PASSED (debootstrap + chroot
+ mksquashfs inside privileged Docker on WSL2 — durable finding, WSL2 is a
viable root-build host), Ubuntu 26.04 codename verified as `resolute`,
nob.h v3.9.0 vendored, build.c compiled clean (-Wall -Wextra), the signed
shim chain extracted (26.04 quirk: MokManager ships as plain mmx64.efi),
tool image built, full ISO build started and was interrupted by the pivot.
Code deleted uncommitted by explicit user choice — this entry is the record.

## [2026-07-16] decision | THE PIVOT — from installable ISO to web-OS-in-a-container

Fourth grilling. ImbatranimOS is now a real Alpine-based Docker container
whose entire GUI is a React web desktop ("B: real OS, browser = screen" —
real PTY terminal, real FS, real processes). Locked: Docker runtime;
NestJS backend (fork reuse over Go's smaller image); fork of
gandolh/minimal-web-desktop as the frontend/backend base; internet-
exposable with proper auth day 1 (single user, sessions + password, TOTP
option); shell as `imbatranim` with NO sudo; volume-backed /home; v1 apps
= terminal/files/system-monitor + notes/todo/bookmarks/notepad; identity
carryover (Win7-classic, B&W + accent); friend-run bar replaces
friend-install bar. ISO-era decisions superseded — compressed record kept
in [wiki/decisions.md](wiki/decisions.md).

## [2026-07-16] maintenance | Corpus rewritten for the web-OS era

Wiki spine rewritten (overview, architecture, decisions, status,
open-questions, CLAUDE.md invariants, routing). Briefs 01–07 moved to
superseded/ with top notes; briefs 08–15 filed covering the whole v1 path:
fork-bootstrap → container-image → auth → {terminal, files, monitor} →
reskin → v1-release. ISO-era files deleted from the working tree.

## [2026-07-16] decision | Brief 08 grilled — fork recon + layout/container/metadata calls

Inspected minimal-web-desktop (main): layout apps/frontend + apps/backend
+ infrastructure/, 2 containers (:5173/:3001), bind-mount ../data, and it
ALREADY ships xterm + a service-launcher, plus its own corpus/CLAUDE.md/
.agents/UBIQUITOUS_LANGUAGE.md. Grilling resolved: (1) keep fork's apps/
layout, update our architecture.md to match; (2) container = ONE
multi-stage Dockerfile, dev target (Nest+Vite HMR, 2 ports) / prod target
(Nest serves statics, 1 port, slim) — amends decision 09's one-port rule
to mean prod-only; (3) import code only, drop the fork's corpus/CLAUDE/
.agents/UBIQUITOUS_LANGUAGE (ours is source of truth), mine for facts
first; (4) xterm terminal already exists — brief 08 investigates the
backend PTY reality and adjusts brief 11's scope, does not rebuild blind.
Briefs 08 + 09 rewritten with these; architecture.md + decisions.md updated.

## [2026-07-16] done | Brief 08 — fork imported, pruned, dev loop verified

Imported apps/ + infrastructure/ from minimal-web-desktop (upstream
1a72385, clean copy). Pruned docker-desktop + service-launcher (FE) and the
docker + services modules (BE) + orphaned dockerode. Both apps typecheck +
build clean; node-pty native loads; dev loop smoke-tested (backend
/health + /api/todos, DB inits at configured path, Vite HMR serves).
Load-bearing findings folded into wiki: fork's "terminal" is an HTTP
command-runner not a live PTY (brief 11 stays real work, adjusted); fork
has ZERO auth (brief 10 greenfield); frontend deps split across
apps/package.json + apps/frontend/package.json; file-manager/notes overlap
brief 12. Committed to main in 3 commits (pivot corpus, raw import, prune).

## [2026-07-16] done | Brief 09 — dual-mode container image (desktop+API on one port)

One multi-stage infrastructure/Dockerfile: deps → builder → proddeps → prod
+ dev targets. Backend gained a conditional ServeStaticModule (prod serves
the built desktop on the API port, excludes /api + /health, SPA fallback);
prod frontend built same-origin (VITE_API_URL=/api). imbatranim user uid
1000 (default node user dropped), volume /home/imbatranim, idempotent
entrypoint. Verified: one-port desktop+API, unprivileged user, todo
survives container recreate on the volume, better-sqlite3 + node-pty load
in-image. Compose: prod service + dev profile (bind-mount + HMR, 2 ports).

REVISIT FLAGGED: prod image is 364 MB (cut from 657 MB by dropping the
frontend's hoisted node_modules from runtime + stripping native build
intermediates), over the ~150 MB target and the 200 MB tripwire. Backend-
language decision (NestJS vs Go) is up for a user revisit; recorded in
wiki/open-questions.md + status.md, not silently resolved.

## [2026-07-16] decision | Image-size revisit resolved — keep NestJS, retire 150MB target

User revisited the 364 MB prod image (brief 09 tripwire). Decision: keep
NestJS (fork reuse >> image bytes for a run-once container), retire the
~150 MB target / 200 MB tripwire as unrealistic for Node+Nest, set a new
bar of ≤~400 MB image with cold-start + idle RAM as the real "lightweight"
measure (recorded in brief 15). Amended in wiki/decisions.md.

## [2026-07-16] todo | Brief 16 filed — Turborepo integration

Filed [briefs/done/16-turborepo.md](briefs/done/16-turborepo.md): convert the
repo to a real npm workspace (root package.json + single lockfile; today there
are THREE independent npm ci roots — apps/, apps/backend, apps/frontend — and
apps/package.json looks vestigial from the fork), add turbo.json pipeline
(build/lint/test/dev), adapt infrastructure/Dockerfile install+build layers.
Layout stays locked per decisions.md.

## [2026-07-16] decision | Brief 16 grilled — turbo design locked

Grilling closed four branches: npm workspaces (not pnpm/bun); prod image
stays backend-only via `npm ci --omit=dev --workspace=backend` (not turbo
prune, not root ci); `turbo dev` replaces the dev CMD `&`-shell; local
cache only (no remote cache/CI — revisit with brief 15). Code check found
apps/package.json is PARTIALLY load-bearing: frontend resolves tailwindcss
+ @tailwindcss/vite from apps/node_modules (phantom deps) — brief now
rehomes those two and drops the three unused. Brief 16 rewritten as the
complete spec; build deferred.

## [2026-07-16] todo | Brief 17 filed — backend / core / add-ons restructure

Filed [briefs/done/17-os-restructure.md](briefs/done/17-os-restructure.md):
user-requested split into backend, core (desktop + main OS functions), and
add-ons with one directory per app. Flags an explicit revisit of the locked
"keep the fork's repo layout" decision (amend decisions.md when it lands)
and the interplay with brief 16's workspace/Dockerfile paths (sequencing to
be grilled). Ungrilled — open questions recorded in the brief.

## [2026-07-16] decision | Brief 17 grilled — restructure design locked

Grilling closed the open branches: roots at apps/{backend,core,add-ons/<app>};
ONE WORKSPACE PACKAGE PER ADD-ON (@imbatranim/<app> — user chose stronger
than the folders+lint option); add-ons are frontend-only (backend modules/
tree untouched, seam = HTTP API); core roster = shell + auth + settings,
every windowed app is an add-on (terminal/files/monitor from briefs 11-13
will land as add-ons). Core is the Vite host; apps/core/src/manifest.ts is
the single composition root allowed to import add-ons — this inverts
today's backwards seam (registry + command sources statically import
modules). Sequencing: brief 16 (turbo) first. Brief 17 rewritten as the
complete spec; build deferred.

## [2026-07-17] done | Brief 10 built — auth lands, the OS has a lock

Auth is live end-to-end: single-user credential store in SQLite (argon2id),
httpOnly `imb_session` cookies (SHA-256 stored server-side), first-run
password wizard (no default password ever), optional TOTP (QR enroll in
Settings), per-IP login throttle with backoff, and a global NestJS guard —
every REST route 401s without a session except @Public() auth routes. WS
upgrades get `SessionService.validateFromRequest` via the `ws-auth` barrel
(consumed by brief 11). Frontend: AuthGate gates the whole desktop behind
LockScreen/FirstRunWizard. HTTPS open question RESOLVED: reverse-proxy TLS
(Caddy), recipe in infrastructure/README.md; cookies get Secure via
COOKIE_SECURE/TRUST_PROXY env switches. 32 unit + 11 e2e tests green.
Caveat: argon2-on-Alpine docker build verified by analogy, re-verified in
brief 15's security pass.

## [2026-07-17] done | Brief 11 built — a real terminal, the old repl absorbed

Streaming WS PTY bridge at `/api/pty`: node-pty login shell per socket,
cookie-session auth at upgrade (unauthenticated → 401), resize→SIGWINCH,
WS backpressure so output floods can't kill the tab, revoked sessions kill
their PTYs within 30s. Frontend Terminal (xterm + fit) replaces the
repl-interpreter UI; registry entry is now `terminal`, multi-instance (two
windows = two shells, verified by PID in e2e). The fork's config-based
`repl` module (HTTP command-runner) is deleted — absorbed by the real
terminal, resolving that open question. 17 unit + 3 e2e tests.

## [2026-07-17] done | Brief 12 built — the real filesystem in a window

`files` module extended with a `home` root over the actual home dir;
full REST surface (list/stat/content/download/upload/mkdir/move/copy/
delete) behind the global auth guard. Path jail is defence-in-depth
(percent-decode loop, NUL reject, absolute re-root strip, lexical
containment, realpath symlink verification incl. not-yet-existing
targets) — refusals proven by tests (`../../etc/passwd`, `%2e%2e`,
`%252e`, symlink-out). Binary upload/download round-trips byte-equal.
file-manager UI: tree + list panes, context menu, drag-drop upload,
notes→notepad open intent (also killed the old cross-module store import).
Resolves the files-vs-file-manager/notes reconciliation question: extend,
no duplication; notes module untouched and now rides the hardened service.

## [2026-07-17] done | Brief 13 built — live vitals, and the app-install stance

System Monitor lands: real CPU% (delta cache), memory, home-volume disk,
process table (pid/uid/cpu/mem via ps), About panel (hostname, kernel,
uptime, IMAGE_VERSION), and a kill endpoint hard-scoped to the server
process's own uid (/proc/<pid>/status check; 403 otherwise) with a signal
allowlist — 8 unit tests incl. an unmocked /proc self-read, plus a live
smoke test against the real host. Frontend polls at 1.5s via react-query.
The "app install without sudo" open question is RESOLVED for v1 and
recorded in decisions.md: the Linux side is fixed at image build; adding
apps means adding web-app modules to the desktop registry.

## [2026-07-17] done | Brief 14 built — ImbatranimOS looks like itself

The Win7-classic B&W identity is on screen: bottom taskbar with running-
window buttons and a live tray clock, start button wearing a new geometric
hourglass mark ("îmbătrânim" = we age), compact start menu with the app
list + Lock/Log off, flat near-black/off-white window chrome with an
accent focus tick, themed lock screen/first-run wizard, token-driven xterm
theme. Dark is the shipped default; Space Grotesk + Inter kept. One
parameterized accent var with 4 Settings presets; crimson #c0263a ships as
the PROVISIONAL default (recommended: distinctive vs OS-blue cliché, best
white-on-accent contrast ~6.5:1) — the accent open question stays open
until the user picks from the live desktop. No fork branding remains.
Browser-verified; builds clean.

## [2026-07-17] progress | Brief 15 engineering slice — hardened, measured, stamped

Security pass: route-by-route enumeration + live container probes found NO
auth bypasses (unknown /api/* is 404 JSON not SPA, HEAD hits the guard,
PTY upgrade fails closed on odd paths); FS jail re-reviewed adversarially
— solid, +4 traversal unit tests; multipart filename traversal verified
harmless (busboy basenames + jail backstop). Fixes: over-cap upload now a
clean 413; leftover repl_configs table dropped; dependency-free security
headers (nosniff, frame DENY, no-referrer, CSP tuned to the real build;
HSTS left to Caddy). Backend tests 73 unit + 29 e2e. README rewritten as
the product page (honest no-reset-flow FAQ); everything stamped 1.0.0
(package.jsons, compose imbatranimos:1.0, OCI labels, IMAGE_VERSION).
REAL prod container verified: argon2-on-Alpine WORKS (question closed),
full curl auth flow correct, headers live. Numbers: image 382 MB (≤400 ✓),
cold start 1.42 s, idle RAM 41.3 MiB — "lightweight" receipt recorded.
npm audit triage (nothing applied, lockfiles untouched): bump
@nestjs/platform-express (patched multer DoS) and axios (frontend,
runtime); vite/build-chain items dev-only. Brief 15 stays in todo/ —
remaining acceptance is human-gated: friend-run QA, VPS+HTTPS deploy,
accent final pick, dep bumps, git tag v1.0.

## 2026-07-17 — Brief 16 (turborepo) landed

npm workspaces + turbo 2.10.5, commit `15ae437`. One root lockfile
replaces the three per-dir installs; `apps/package.json` deleted —
tailwindcss + @tailwindcss/vite rehomed to frontend devDeps, the three
unused deps (react-router, react-hook-form, xterm) dropped as decided.
Root `npm run build/lint/test/format:check/dev` via turbo; FULL TURBO
cache hit verified. Dockerfile: one `npm ci` at /app, `npx turbo build`,
proddeps `npm ci --omit=dev --workspace=backend`; prod image 385 MB
(zero frontend deps confirmed), health 200 ~1.1 s; compose dev = Nest
watch + Vite HMR under `npx turbo dev`. Two decisions made while
landing: (1) turbo `envMode: loose` — strict mode filtered runtime env
(DB_PATH etc.) from tasks and crashed Nest in the dev container;
(2) prettier pinned exactly 3.8.3 in both apps — the regenerated
lockfile pulled 3.9.5 which reformats ~30 files. Found + fixed in
passing: dev image never copied entrypoint.sh (pre-existing; container
could not start). Found, NOT fixed (src off-limits): frontend eslint
errors + backend never prettier-clean → todos/lint-format-debt.md.
Fresh `npm audit`: 0 vulnerabilities at the new lockfile — the brief-15
audit-triage item is effectively closed by the dep refresh.

## 2026-07-17 — Brief 17 (restructure) landed

apps/{backend, core, add-ons/*}, commit `63876e9`. apps/frontend became
apps/core (shell + auth + settings + Vite host, published as
@imbatranim/core via a deliberate public-surface barrel); SEVEN windowed
apps extracted to workspace packages under apps/add-ons/ (the grilled six
plus system-monitor, which landed via brief 13 after the spec was
written — the roster decision covers it). The dependency direction is
inverted for real: add-ons export manifests (AppConfig + optional
commandSources), core/src/manifest.ts is the single composition root
that may import @imbatranim/* (eslint no-restricted-imports enforced in
BOTH directions, proven by deliberate violations), and the old
registry.tsx is a re-export shim so shell consumers didn't churn.
bookmarks/recent-files palette sources moved into their add-ons;
recent-files now delivers the opened path as an intent via openApp (the
shell-owned version opened an empty window). Verified end-to-end in a
real browser (agent-driven): wizard → login → all 8 apps open, live PTY,
add-on bookmark results in the palette; built CSS byte-identical.

Two significant finds: (1) REAL BUG, pre-existing — the taskbar Tray
typed /api/system/stats as {cpu: number, ramUsedGb…} but the API returns
{cpu:{percent,cores}, memory:{…}}; the desktop white-screened after
login on every deploy since the brief 13/14 seam. curl-based verify
(brief 15) could never see it — a browser-level check now exists as the
bar. Fixed in core. (2) The "backend was never prettier-clean" debt got
paid: formatting sweep `934619f` (89 files, verified neutral: tests +
byte-identical CSS), after root-pinning prettier 3.8.3 so backend's
eslint-plugin-prettier stops resolving whatever npm hoists. Root lint is
green for core + all 7 add-ons; backend#lint stays red on pre-existing
unsafe-any in raw sqlite code (out of scope for 17; still in
todos/lint-format-debt.md). Also fixed while acceptance demanded green
lint on the moved surface: 6 pre-existing react-hooks setState-in-effect
errors (render-time adjustment pattern) and dead ReplInterpreter.tsx
deleted.

## [2026-07-17] todo | Brief 18 filed — Alpine kiosk ISO, researched

Filed briefs/todo/18-alpine-kiosk-iso.md: the post-v1 bare-metal
variant — a bootable Alpine ISO whose whole interface is one fullscreen
chromium (cage Wayland kiosk) rendering the web UI served by a local
backend. Research done inline and folded into the brief: cage 0.2.0 +
chromium 142 (263 MiB installed) are in Alpine 3.22 community;
greetd/agetty autologin recipes exist and are proven (~235 MB X11
signage image as prior art); cog/wpewebkit not packaged, ruled out.
Build = aports mkimage.sh custom profile (mkimg.imbatranim.sh +
genapkovl-imbatranim.sh) driven by build.c + vendored nob.h in Docker,
per the user's spec — same pipeline shape as the superseded ISO era.
Diskless run-from-RAM model; est. 1.5–2 GB RAM floor, to be measured.
Docker stays the primary dev/test loop; doesn't flip the "bootable is
not v1" decision.

## 2026-07-17 — Office suite grilled: todo promoted to briefs 19 + 20

Grilled todos/office-suite-addon.md into two post-v1 briefs. Locked:
client-side JS engines only (no OnlyOffice/Collabora server, no
LibreOffice in the image — slim-container identity holds). Four
packages, Google-flavored names: PDF Viewer (react-pdf, view-only),
Slides (best-effort pptx renderer, view-only, spike-gated), Sheets
(Univer Apache-2.0 + SheetJS CE xlsx bridge, editing, spike-gated),
Docs (SuperDoc, real docx round-trip editing). SuperDoc is AGPL-3.0 —
user approved relicensing the repo AGPL-3.0-only (source stays public
on GitHub, no sale plans); the relicense lands in brief 20. UX locked:
explicit Save only (Ctrl+S, overwrite in place, dirty `•`, no autosave
despite the notepad precedent), new documents via file-manager
right-click → New → Spreadsheet/Document (editors stay dialog-free).
Brief 19 = viewers + file-manager ext→app map; brief 20 = editors +
LICENSE. Both queued after brief 15 (v1), non-gating. Brief number 18
was already taken by the kiosk ISO.

## 2026-07-17 — Snipping Tool + preview pane grilled: briefs 21 + 22

Grilled todos/screenshot-tool-addon.md and todos/file-preview-pane.md.
Brief 21 (Snipping Tool, @imbatranim/snipping-tool — the Win7-era
name): capture = DOM rasterization, spike-gated (getDisplayMedia
rejected — permission dialog breaks the OS illusion; server-side
rendering rejected — slim-image invariant). One flow: dim + crosshair
overlay via body portal (covers taskbar), drag region / Enter = full
desktop; annotation kit arrow/rect/text/pixelate/freehand + undo +
color; exits = Save to ~/Pictures/Screenshots (primary) + Copy
(clipboard, secure-context best-effort) + Download. Per-window capture
and keybinds deferred. Brief 22 (preview pane): extends the existing
file-manager (no new package) with an Explorer-style toggleable pane —
text/images/audio/video via native rendering, zero new deps, metadata
card fallback; PDF/markdown previews deferred (removes any dep on
brief 19). Both post-v1, non-gating, independent.

## 2026-07-17 — Brief 18 done: Alpine kiosk ISO boots into the browser

Built the post-v1 bare-metal variant under `iso/` (own lane, no
`apps/**` or `infrastructure/**` touched). `./build iso` = a C driver on
vendored nob.h v3.10.0 that exports a clean `git archive HEAD` snapshot,
builds an Alpine 3.22 Docker toolbox, and runs the official aports
`mkimage.sh` **unprivileged (fakeroot)** — the WSL2 smoke test passed on
the first try (no privileged fallback needed; that durable ISO-era
finding still holds, now for mkimage too).

Decisions (open questions resolved, rationale in `iso/README.md`):
- **App delivery = custom signed `.apk`** (not tarball-in-overlay). The
  payload — backend dist + core statics + prod node_modules with
  better-sqlite3/node-pty/argon2 compiled for Alpine's musl+nodejs ABI —
  ships as `imbatranim-os`, served to mkimage from a local signed repo.
  Its `depends=` drags in the whole kiosk stack so the apkovl world is two
  lines (alpine-base + imbatranim-os) and the overlay stays tiny (~950 B),
  which matters for diskless RAM. Feasible, so the fallback wasn't needed.
- **Autologin = greetd** (not agetty+profile): `initial_session` execs the
  kiosk launcher as `imbatranim` with no greeter and no getty on any VT →
  satisfies "no console / no shell flash" cleanly. seatd for seat mgmt,
  XDG_RUNTIME_DIR set by the launcher (no elogind, lighter).
- **Kernel lts**, **stateless tmpfs** (fresh setup each boot — invariant-
  clean; lbu persistence is the later path), **browser knob** deferred.

Verification (QEMU/VirtualBox binaries absent, but `/dev/kvm` present, so
booted qemu inside Docker with `--device /dev/kvm`): the ISO **boots via
BIOS straight into fullscreen chromium showing the ImbatranimOS first-run
login** — hourglass logo, "Set up this computer" password form, crimson
theme, no console, no window chrome, no shell. Screenshot-verified. Two
bugs found+fixed this way: (1) the launcher couldn't `mkdir /run/user/<uid>`
(no elogind) → fall back to a `/tmp` runtime dir; (2) when the session
failed greetd showed a fallback `login:` prompt → launcher now never exits
(loops forever) so the browser always owns the screen. Measured: ISO
**580 MiB**, RAM floor **2 GB** (1 GB reaches OpenRC but the run-from-RAM
install exhausts tmpfs), boot-to-login **< ~2 min** under emulation.

Human-gated remainder (couldn't do headless): UEFI *live* boot (the ISO
has the UEFI El Torito image + bootx64.efi structurally, and BIOS boot
works), VirtualBox/Hyper-V, real/old hardware, and the interactive
type-password → terminal/files walkthrough. Docker dev loop untouched;
root README gained one `iso/` pointer (docker stays the headline).

## 2026-07-17 — Briefs 22 + 21 done: preview pane and Snipping Tool

Wave 1 of the post-v1 backlog run (orchestrated: plan-split-dispatch in
waves, one commit per brief). Brief 22 (`2b014b2`): Explorer-style
toggleable preview pane inside file-manager — text/images/AV native,
metadata card for everything else (never an error), 1 MB text cap,
debounced selection with stale-fetch protection, drag-resizable width +
toggle persisted in localStorage, auto-collapse below 640 px, zero new
deps. Found + fixed a pre-existing FileList bug: row clicks bubbled to
the background clear-selection handler, so mouse click-to-select had
never worked. Brief 21 (`acfe862`): Snipping Tool on html-to-image
(spike passed — xterm v6 runs the DOM renderer here, so terminal
content rasterizes as real DOM), dim+crosshair portal overlay, 5
annotation tools + undo, Save/Copy/Download exits; rasterizer a lazy
chunk; tray icon + PrintScreen deliberately skipped (scope latitude,
rationale in the brief outcome).

## 2026-07-17 — Brief 19 done: PDF Viewer + Slides, ext→app open map

Commit `685012c`. Spike PASSED on a real 11-slide deck → Slides ships
(pptx-preview; synthetic pptxgenjs decks render empty, so a "nothing
rendered → Download" fallback covers unparseables). Deviation: PDF
engine is pdfjs-dist direct instead of react-pdf (cleaner lazy
loading). The shared plumbing both office briefs need landed here:
file-manager `lib/openWith.ts` extension→app map driving double-click,
Enter, and context menu. Durable pattern for all document apps: latch
the open-intent in a ref-guarded effect (notepad's render-selector
consume is StrictMode-unsafe — captured as
todos/notepad-intent-strictmode.md), fetch bytes via core's authed
client, keep engines behind dynamic import (verified separate chunks).

## 2026-07-17 — Brief 20 done: Sheets + Docs, AGPL relicense; sheets engine REVISED

Commits `b9fe0fa` (relicense) + `3531b41` (editors). The SheetJS CE ↔
Univer spike FAILED the locked formatting bar: SheetJS CE's writer
strips fonts/fills/borders on save (Pro-only) — confirmed with a pure
read→write→read, independent of the bridge. User re-decided same day:
**ExcelJS (MIT) is the xlsx bridge** (decisions.md revised); its spike
passed the full bar (values, formulas, number formats, bold, colors,
fills, multi-sheet; verified via independent openpyxl read). Docs hit a
second landmine: SuperDoc 1.45 export silently returns the ORIGINAL
bytes when a docx lacks styles.xml / document.xml.rels / custom.xml
(unguarded `convertedXml[...].elements[0]` reads, throw swallowed) —
root-caused and fixed with `normalizeDocx()` injecting minimal parts on
open; round-trip then verified on disk. Repo is now AGPL-3.0-only
(SuperDoc requirement, approved at grilling). Core windowStore gained
generic `updateTitle` + close-guard hooks (the brief's "one manifest
line" core assumption was wrong; controller-authorized). Explicit-Save
UX per spec: Ctrl+S, dirty •, close warning, New → Spreadsheet/Document
from embedded blank templates.

## 2026-07-17 — Review pass over the backlog run: 6 findings fixed

Three scoped sonnet finders (integration/wiring, new-module logic,
security/invariants) swept the cumulative diff; integration finder came
back clean. Six confirmed findings fixed in `b46f64e`: (1) xlsx bridge
read `value.sharedFormula` — the master ADDRESS, not a formula — for
fill-down followers, corrupting every shared formula on save; now reads
the translated `cell.formula` (round-trip-proven). (2+3) both editors
cleared the dirty flag after an in-flight save even when edits arrived
during the upload (close-guard then silent → data loss); fixed with an
edit-counter snapshot. (4) Slides stale renders could interleave two
decks in the shared stage node; renders now own detached targets
committed only if current. (5) screenshot filenames collided within the
same second; ms suffix. (6) ISO post-install ran `passwd -u` (unlock)
under a "lock the password" comment — the belt-and-braces `*` line made
the end state safe incidentally; now `passwd -l`. Reuse debt (4×
duplicated fileBytes/openedFileStore helpers, hand-rolled download
URLs) deliberately NOT refactored at the tail of the run — captured as
todos/office-addon-shared-helpers.md for a core-contract brief.

## 2026-07-17 — Full review pass + brief 23 (shared-addon-kit)

Ran a 3-reviewer + verifier sweep (security / performance / code-smell,
each opus; opus verifier to drop false positives) over the whole
codebase. 30 findings survived verification (no outright false positives;
one dedup, a few line corrections). Applied + committed the **safe
subset**: the genuinely dangerous security items (session cookie
auto-Secure from req protocol, TOTP enroll step-up password, WS terminal
Origin check, PTY concurrency cap + geometry clamp, throttle global
backstop, `/files/content` size cap, Content-Disposition sanitize) plus
perf/code-quality wins (debounced layout persist, tab-gated system-monitor
poll + row cap, streamed uploads, bookmarks index/typing, query-DTO
validation, dead-code + magic-number cleanup, PTY types). Backend 80 unit
+ 29 e2e green; monorepo typecheck/format clean; backend#lint debt
unchanged (pre-existing, [lint-format-debt](todos/lint-format-debt.md)).
Deferred the larger refactors + product-decision security items as todos.
Two commits on `main`.

Then built **brief 23** via plan-split-dispatch (1 senior core surface +
8 consumer chunks). Collapsed the duplicated add-on spine into
`@imbatranim/core`: `fetchFileBytes`/`uploadFileBytes`/`UploadTooLargeError`/
`downloadUrl`/`fileName`, `createOpenedFileStore`,
`useOpenIntent`/`useSaveHotkey`/`useUnsavedGuard`, `ConfirmDialog`/
`useConfirm`. All four document add-ons deleted their local
`api/fileBytes.ts` + `store/openedFileStore.ts` (8 files) and adopted the
hooks; download buttons route through core `downloadUrl`;
bookmarks/sticky-notes/notepad dropped native `confirm()` for the themed
dialog (file-manager kept its already-correct themed delete Dialog — a
deliberate scope trim). Net −333 LOC. Gates: turbo typecheck 13/13,
format 14/14, lint 13/13, build ✓. A 2-finder review (opus integration +
sonnet core-logic) confirmed the single shared opened-file store is a safe
singleton (uuid windowIds, multiInstance) and hook behavior parity is
exact; its findings (`useConfirm` re-entrancy + unmount promise-hang, a
param-shadow, a sheets fallback drift `workbook.xlsx`) were fixed.
Promoted todos office-addon-shared-helpers + destructive-action-confirm-ux
removed on completion; discovered nits captured in
[add-on-cleanup-nits](todos/add-on-cleanup-nits.md) (dead `zustand` deps,
notepad native `prompt()`). Human-gated remainder: the in-browser
walkthrough per the brief's verify bar.

## 2026-07-17 — Full-auto backlog run: briefs 24 + 25 (review-pass todos)

Master-orchestrator run through the deferred review todos (standing
authorization). Briefs 24 and 25 built in parallel (disjoint file sets),
verified together, committed separately.

- **Brief 24 (window-render-perf, PERF-1):** one senior agent, indivisible
  core change. `WindowContainer` subscribes only `{id,appId,zIndex,
  isVisible}` via `useShallow`; `Window` is `React.memo` reading its own
  instance via `s.windows.find`; `ResizeHandle` reads `getState()` in its
  handler. Untouched windows keep object identity + the container's
  projected list is drag-invariant, so only the moving window's chrome
  re-renders and no app subtree reconciles. Per-frame store updates kept
  (snapping byte-identical). No transform-drag (out of scope).
- **Brief 25 (notes/FilesService dedup, CS-7):** backend `notes` collapsed
  to `/notes/recent`; Notepad repointed to `/files?root=notes`; removed the
  8 delegation methods, the FilesService dep, and the file-ops/directory-ops/
  path-query DTOs. `createFile` is now an upsert (no create-only `/files`
  endpoint) — accepted for single-user Notepad. `FilesService.ROOTS.notes`
  kept so File Manager + Notepad share one validated surface.

Gates (both): turbo typecheck 13/13, build ✓, format 14/14, lint 13/13,
backend 80 unit + 29 e2e green. Human-gated remainders: in-browser drag
feel (24) and Notepad walkthrough (25). Remaining backlog: CS-3 (26),
PERF-6 (27), SEC-2 (28), lint-debt (29), add-on polish (30); SEC-9 + SEC-10
deferred (browser/ISO-gated).
