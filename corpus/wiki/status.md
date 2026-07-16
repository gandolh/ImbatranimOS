---
summary: Dated snapshot — pivoted to web-OS-in-a-container, ISO era closed, briefs 08–15 filed, building starts with the fork bootstrap.
updated: 2026-07-16
---

# Status — 2026-07-16

**Phase: pivoted and re-specified, ready to build.** The project became a
web-OS: real Alpine container, React desktop as its screen (see
[decisions.md](decisions.md)). The ISO era closed the same day it opened —
its pipeline was proven (WSL2 Docker smoke test PASSED, driver compiled,
full build started) before being superseded and deleted by choice.

## Briefs

| # | Brief | State | One-liner |
|---|---|---|---|
| 01–07 | ISO era | superseded | Full installable-distro path; record in briefs/superseded/ + log |
| 08 | [fork-bootstrap](../briefs/todo/08-fork-bootstrap.md) | todo | Import minimal-web-desktop fork, prune dev-host apps, dev loop runs |
| 09 | [container-image](../briefs/todo/09-container-image.md) | todo | Alpine image, imbatranim user (no sudo), one port, volume home, size measured |
| 10 | [auth](../briefs/todo/10-auth.md) | todo | Sessions + password + TOTP option, rate limits, HTTPS story — gates system apps |
| 11 | [terminal-app](../briefs/todo/11-terminal-app.md) | todo | xterm.js ↔ node-pty over authed WS |
| 12 | [files-app](../briefs/todo/12-files-app.md) | todo | Real-FS explorer, traversal-proof, upload/download |
| 13 | [system-monitor](../briefs/todo/13-system-monitor.md) | todo | Live CPU/RAM/disk/processes + About panel |
| 14 | [imbatranim-reskin](../briefs/todo/14-imbatranim-reskin.md) | todo | Win7-classic layout, B&W tokens + accent mockup pick |
| 15 | [v1-release](../briefs/todo/15-v1-release.md) | todo | Security pass, README-as-product, friend-run QA, tag v1.0 |

Dependency order: 08 → 09 → 10 → {11, 12, 13} → 14 → 15.

## Where things stand

Working tree holds only the corpus + a pivot-era README; ISO code deleted
uncommitted (explicit choice). Nothing committed to git yet. Next action:
work brief 08 (fork import + prune).
