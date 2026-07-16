---
summary: Dated snapshot — web-OS era; brief 08 (fork import + prune) DONE and committed; 09 (container image) is next.
updated: 2026-07-16
---

# Status — 2026-07-16

**Phase: building.** The project is a web-OS: real Alpine container, React
desktop as its screen (see [decisions.md](decisions.md)). Brief 08 landed —
the fork is imported, pruned, and running. Committed to `main` (local-only
project, no PR/CI).

## Briefs

| # | Brief | State | One-liner |
|---|---|---|---|
| 01–07 | ISO era | superseded | Full installable-distro path; record in briefs/superseded/ + log |
| 08 | [fork-bootstrap](../briefs/done/08-fork-bootstrap.md) | **done** | Imported + pruned minimal-web-desktop; dev loop verified |
| 09 | [container-image](../briefs/todo/09-container-image.md) | todo | Dual-mode Dockerfile (dev HMR / slim prod), imbatranim user, volume home, size measured |
| 10 | [auth](../briefs/todo/10-auth.md) | todo | Sessions + password + TOTP option, rate limits, HTTPS story — GREENFIELD (fork has zero auth) |
| 11 | [terminal-app](../briefs/todo/11-terminal-app.md) | todo | Real WS PTY — fork's repl is HTTP command-runner, not a live TTY; node-pty+xterm are a seed |
| 12 | [files-app](../briefs/todo/12-files-app.md) | todo | Real-FS explorer — reconcile with existing file-manager + notes modules |
| 13 | [system-monitor](../briefs/todo/13-system-monitor.md) | todo | Live CPU/RAM/disk/processes — fork's `system` module is a partial seed |
| 14 | [imbatranim-reskin](../briefs/todo/14-imbatranim-reskin.md) | todo | Win7-classic layout, B&W tokens + accent mockup pick |
| 15 | [v1-release](../briefs/todo/15-v1-release.md) | todo | Security pass, README-as-product, friend-run QA, tag v1.0 |

Dependency order: 08 ✓ → 09 → 10 → {11, 12, 13} → 14 → 15.

## Where things stand

`apps/frontend` + `apps/backend` + `infrastructure/` imported (upstream
`1a72385`), dev-host apps pruned; both typecheck/build clean, node-pty
loads, dev loop smoke-tested (backend health + API, Vite HMR). Four commits
on `main`. Next action: work brief 09 (dual-mode container image) — but note
brief 10 (auth) is greenfield and gates the system apps, so 09→10 is the
critical early path before any real shell ships.
