---
summary: Dated snapshot — web-OS era; briefs 08 (fork) + 09 (dual-mode container) DONE; one open decision (image size 364MB > target) awaiting a user call; auth (10) is next.
updated: 2026-07-16
---

# Status — 2026-07-16

**Phase: building.** The project is a web-OS: real Alpine container, React
desktop as its screen (see [decisions.md](decisions.md)). Briefs 08 + 09
landed — the fork is imported/pruned and the dual-mode container image
builds and runs (desktop + API on one port, unprivileged imbatranim user,
volume-persisted home). Committed to `main` (local-only, no PR/CI).

## Metrics (recorded)

- Prod image size: **364 MB** (node:22-alpine base ~140 MB + backend
  node_modules ~130 MB + built app). Accepted 2026-07-16 — NestJS kept, the
  150 MB target retired as unrealistic; "lightweight" now measured by
  cold-start + idle RAM (TBD in brief 15). See [decisions.md](decisions.md).

## Briefs

| # | Brief | State | One-liner |
|---|---|---|---|
| 01–07 | ISO era | superseded | Full installable-distro path; record in briefs/superseded/ + log |
| 08 | [fork-bootstrap](../briefs/done/08-fork-bootstrap.md) | **done** | Imported + pruned minimal-web-desktop; dev loop verified |
| 09 | [container-image](../briefs/done/09-container-image.md) | **done** | Dual-mode Dockerfile; one port, imbatranim user, volume home verified; image 364MB (over target — revisit flagged) |
| 10 | [auth](../briefs/todo/10-auth.md) | todo | Sessions + password + TOTP option, rate limits, HTTPS story — GREENFIELD (fork has zero auth) |
| 11 | [terminal-app](../briefs/todo/11-terminal-app.md) | todo | Real WS PTY — fork's repl is HTTP command-runner, not a live TTY; node-pty+xterm are a seed |
| 12 | [files-app](../briefs/todo/12-files-app.md) | todo | Real-FS explorer — reconcile with existing file-manager + notes modules |
| 13 | [system-monitor](../briefs/todo/13-system-monitor.md) | todo | Live CPU/RAM/disk/processes — fork's `system` module is a partial seed |
| 14 | [imbatranim-reskin](../briefs/todo/14-imbatranim-reskin.md) | todo | Win7-classic layout, B&W tokens + accent mockup pick |
| 15 | [v1-release](../briefs/todo/15-v1-release.md) | todo | Security pass, README-as-product, friend-run QA, tag v1.0 |

Dependency order: 08 ✓ → 09 ✓ → 10 → {11, 12, 13} → 14 → 15.

## Where things stand

Fork imported/pruned (08); dual-mode container built and verified (09).
Next action: **brief 10 (auth)** — greenfield (the fork has none) and the
gate before any real shell (brief 11) ships. One decision is parked: the
364 MB image size (backend-language revisit).
