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

Filed [briefs/todo/16-turborepo.md](briefs/todo/16-turborepo.md): convert the
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

Filed [briefs/todo/17-os-restructure.md](briefs/todo/17-os-restructure.md):
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
