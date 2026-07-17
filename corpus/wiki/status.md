---
summary: Dated snapshot — web-OS era; briefs 08–14 + 16 + 17 DONE (…, turborepo, core/add-ons restructure); brief 15's human-gated remainder is all that stands before v1.0.
updated: 2026-07-17
---

# Status — 2026-07-17

**Phase: building.** The project is a web-OS: real Alpine container, React
desktop as its screen (see [decisions.md](decisions.md)). Briefs 08 + 09
landed — the fork is imported/pruned and the dual-mode container image
builds and runs (desktop + API on one port, unprivileged imbatranim user,
volume-persisted home). Committed to `main` (local-only, no PR/CI).

## Metrics (recorded)

- Prod image size: **385 MB** (2026-07-17, post-brief-16 workspace build —
  was 382 at brief 15, 364 before auth/argon2 + system apps; target ≤~400
  ✓). See [decisions.md](decisions.md).
- Cold start: **1.42 s** (container start → first HTTP 200 on /health,
  fresh volume incl. migration). Idle RAM: **41.3 MiB** (docker stats
  after 60 s). The "lightweight" receipts, 2026-07-17.

## Briefs

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

Dependency order: 08 ✓ → 09 ✓ → 10 ✓ → {11 ✓, 12 ✓, 13 ✓} → 14 ✓ → 15
(human-gated remainder). Restructure chain: 16 ✓ → 17 ✓. No build-ready
briefs remain; captures live in todos/ (lint debt, ISO scaffold).

## Where things stand

Engineering for v1.0 is COMPLETE: auth (10), terminal (11), files (12),
monitor (13), reskin (14), and brief 15's hardening slice — 73 unit + 29
e2e backend tests green, prod container verified for real (argon2-on-
Alpine confirmed, full auth flow over curl, 382 MB / 1.42 s / 41 MiB).
Remaining before the v1.0 tag, all human-gated: friend-run QA on a clean
machine, one VPS+HTTPS deploy per the Caddy recipe, the accent final pick
(crimson is provisional), and the recommended dep bumps
(@nestjs/platform-express for multer, axios) — though the brief-16
lockfile regeneration (2026-07-17) already audits clean (0 vulns).
Briefs 16 + 17 landed 2026-07-17: npm workspaces + turbo (one root
install, image 385 MB), then the core/add-ons restructure (7 add-on
packages, inverted registry, eslint-enforced boundary). Brief 17's
browser verification caught and fixed a shipping bug: the taskbar Tray
mis-typed /api/system/stats and white-screened the desktop after login —
a browser-level check is now part of the verify bar. Formatting debt is
paid (format:check 9/9 green); backend type-safety lint debt remains
(todos/lint-format-debt.md) and keeps root `npm run lint` red on
backend#lint only.
