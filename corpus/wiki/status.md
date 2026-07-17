---
summary: Dated snapshot — web-OS era; briefs 08–14 + 16–22 DONE (incl. the 2026-07-17 post-v1 backlog run — kiosk ISO, office suite, snipping tool, preview pane); brief 15's human-gated remainder is all that stands before v1.0.
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
- **Kiosk ISO (brief 18, post-v1):** `imbatranimos-1.0.0-x86_64.iso` =
  **580 MiB** (hybrid BIOS+UEFI, diskless). RAM floor **2 GB** (measured:
  2 GB boots fully to the kiosk login; 1 GB reaches OpenRC but the diskless
  tmpfs can't hold the ~1 GB run-from-RAM install, so the stack never comes
  up — 4 GB comfortable). Boot-to-login **under ~2 min** under KVM emulation
  (each boot re-installs ~250 pkgs into tmpfs). Built unprivileged in Docker
  on WSL2 (fakeroot). 2026-07-17.

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
| 18 | [alpine-kiosk-iso](../briefs/done/18-alpine-kiosk-iso.md) | **done** (QEMU-verified) | Post-v1 kiosk ISO: `./build iso` (nob.h build.c → Docker → mkimage, unprivileged/fakeroot) makes a 580 MiB hybrid BIOS+UEFI diskless ISO. App ships as a signed custom `.apk` (musl-compiled native addons); greetd autologin → cage + chromium --kiosk → the web UI off the local backend. **KVM-booted into the fullscreen first-run login, no console/shell** (screenshot-verified); RAM floor 2 GB. Human-gated: UEFI live boot + VirtualBox/Hyper-V + real HW + interactive terminal/files walkthrough |
| 19 | [office-viewers](../briefs/done/19-office-viewers.md) | **done** | PDF Viewer (pdfjs-dist) + Slides (pptx-preview — spike passed on a real 11-slide deck); file-manager ext→app map (lib/openWith.ts) drives double-click/Enter/context menu; engines lazy chunks |
| 20 | [office-editors](../briefs/done/20-office-editors.md) | **done** | Sheets (Univer + ExcelJS bridge — SheetJS CE failed the styling spike, user-approved engine revisit) + Docs (SuperDoc + docx normalizer fixing a silent-save-loss defect); AGPL-3.0 relicense landed; explicit Save, dirty •, close guard, New→Spreadsheet/Document |
| 21 | [snipping-tool](../briefs/done/21-snipping-tool.md) | **done** | Flameshot-style capture via html-to-image (spike passed incl. xterm content), dim+crosshair region/Enter/Esc flow, 5 annotation tools + undo, Save to ~/Pictures/Screenshots / Copy / Download; rasterizer lazy |
| 22 | [file-preview-pane](../briefs/done/22-file-preview-pane.md) | **done** | Explorer-style toggleable preview pane in file-manager: text/images/AV native, metadata-card fallback, 1 MB text cap, persisted width/toggle, auto-collapse; zero new deps |

Dependency order: 08 ✓ → 09 ✓ → 10 ✓ → {11 ✓, 12 ✓, 13 ✓} → 14 ✓ → 15
(human-gated remainder). Restructure chain: 16 ✓ → 17 ✓. The post-v1
backlog (18 kiosk ISO, 19 → 20 office suite, 21 snipping tool, 22
preview pane) all landed 2026-07-17 in one orchestrated run — waves
{21 ‖ 22 ‖ 18-long-lane} → 19 → 20, one commit per brief, plus a
3-finder review pass whose confirmed findings were fixed and committed.
Captures in todos/: lint debt, office shared-helpers reuse debt,
notepad StrictMode intent bug.

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

The 2026-07-17 backlog run landed the whole post-v1 slate in one
orchestrated session: preview pane (22), Snipping Tool (21), kiosk ISO
(18, KVM-boot-verified), office viewers (19), and office editors (20)
— the last after two mid-flight re-decisions: the Sheets engine moved
to an ExcelJS bridge when SheetJS CE failed the styling spike, and a
SuperDoc export defect (silent original-bytes save on docx missing
optional OOXML parts) was root-caused and fixed with an open-time
normalizer. The repo is now AGPL-3.0-only (SuperDoc). A three-finder
review pass over the cumulative diff confirmed and fixed a
shared-formula corruption in the xlsx bridge, a dirty-flag race in
both editors, a Slides stale-render interleave, a screenshot filename
collision, and an ISO post-install passwd comment/behavior mismatch.
The desktop now has 13 apps; the boot bundle is unchanged (all five
document engines are lazy chunks).
