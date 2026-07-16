---
summary: Dated snapshot — documentation complete, seven briefs filed covering the whole v1 path, building not yet started.
updated: 2026-07-16
---

# Status — 2026-07-16

**Phase: fully specified, ready to build.** Three grilling sessions locked
architecture, build tech, and product/UX (see [decisions.md](decisions.md));
the entire v1 path is decomposed into seven briefs. No code yet.

## Briefs

| # | Brief | State | One-liner |
|---|---|---|---|
| 01 | [build-scaffold](../briefs/todo/01-build-scaffold.md) | todo | Docker image + build.c (nob.h) pipeline + first bootable stock-LXQt ISO; WSL2 smoke test gates it |
| 02 | [desktop-experience](../briefs/todo/02-desktop-experience.md) | todo | Win7-classic LXQt layout, Win-key + shortcuts, desktop icons, default apps |
| 03 | [identity-theming](../briefs/todo/03-identity-theming.md) | todo | B&W retro-simple theme fork + accent mockup decision, Plymouth/SDDM/os-release branding |
| 04 | [app-layer](../briefs/todo/04-app-layer.md) | todo | Flatpak/Discover (no snap), Firefox deb, VLC, notify+one-click updates |
| 05 | [installer](../briefs/todo/05-installer.md) | todo | Calamares: erase/alongside-Windows/manual, Secure Boot shim, branded slideshow |
| 06 | [welcome-app](../briefs/todo/06-welcome-app.md) | todo | QML first-boot tour + system status check |
| 07 | [v1-release](../briefs/todo/07-v1-release.md) | todo | 2GB validation, README-as-product, real-hardware friend-install QA, tag v1.0 |

Dependency order: 01 → {02, 04} → 03 → 05 → 06 → 07. (04 only needs 01;
03 wants 02's layout for honest mockups; 05 needs 03's branding.)

## Where things stand

Next action: work brief 01 — its first task is the
chroot-in-Docker-on-WSL2 smoke test that gates the whole pipeline (see
[open-questions.md](open-questions.md)). Nothing is committed to git yet;
the corpus + briefs should probably be the repo's first commit.
