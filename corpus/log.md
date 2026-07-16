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
