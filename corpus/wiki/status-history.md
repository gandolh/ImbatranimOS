---
summary: The dated status snapshots up to 2026-08-06, unchanged: the web-OS build from the fork through the daily-driver backlog, the 2026-07 sweeps, and the metrics recorded then. Moved out of status.md on 2026-10-04 so that page could be a current snapshot again.
updated: 2026-10-04
---

> Moved here unchanged from [status.md](status.md) on 2026-10-04. It describes
> the project as of 2026-08-06 and before: the pre-Ward authentication it
> mentions (argon2id, TOTP, the first-run wizard) was deleted on 2026-09-06,
> and a local sign-in returned without Ward on 2026-10-04 (brief 152). Read it
> as history.

> **2026-07-19 — first human walkthrough.** Fixed from real QA: Media Player
> seek (backend HTTP Range support, +3 e2e), global-search scroll-reset and
> Git GUI Select crash (both core), SEC-9 CSP tightened to `'self'`. Decided:
> crimson accent confirmed (presets stay), VPS deploy + git tag dropped from
> the v1 bar (version lives in package.json, already 1.0.0), kiosk ISO +
> code-editor File menu deferred post-1.0. Open: Clock timer off-by-one fix is
> written but BLOCKED on read-only `apps/add-ons/*/src` perms (patch in
> scratchpad); 6 non-exploitable moderate `uuid` audit findings await a
> decision (npm `overrides` is ignored in this workspace). Full detail in
> [../log.md](../log.md) 2026-07-19 + [decisions.md](decisions.md) 2026-07-19.

> **2026-08-06:** code-health sweep [brief 100](../briefs/done/100-code-health-sweep-2026-08-06.md) **DONE** — all ~75 findings shipped bar one deferral (backend TS6/eslint10, see decisions), across 10 commits, gate **75/75** with strict mode now on. Fixed the unbuildable prod image, the @pdfcore page-delete corruption + pdf.js worker leak, Sheets date corruption, the 100 KB body cap, norPDF write-back, calendar recurrence, missed clock alarms, and much more. Ship-blockers gone.

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

**2026-07-17 review + brief 23.** A 3-reviewer + verifier pass (security /
perf / code-smell) over the whole codebase produced 30 verified findings:
the safe subset — the dangerous security fixes (auto-Secure cookie, TOTP
step-up, WS Origin check, PTY session cap, throttle backstop, file-content
memory cap) plus perf/code-quality wins — was applied and committed
(backend 80 unit + 29 e2e green); the larger refactors were captured as
todos. The first of those, **brief 23 (shared-addon-kit)**, then shipped:
the office/add-on duplication (CS-1/2/8) and inconsistent confirm UX (CS-12)
are gone, deduped into `@imbatranim/core`. Still open as todos:
window-drag render perf (PERF-1), office parsing off-thread (PERF-6),
FileManager split (CS-3), notes/FilesService dedup (CS-7), first-run setup
hardening (SEC-2), CSP ws scoping (SEC-9), kiosk `--no-sandbox` (SEC-10),
the notepad StrictMode intent bug, lint debt, and add-on cleanup nits.

## 2026-07-17 — Daily-driver expansion backlog

A test-run + research pass ("what to build next for a daily driver — normal
users + web/low-level programmers, no gaming") captured a batch of app/platform
todos in `todos/`. All gates were green at the time (80 unit tests, typecheck
13/13, lint 0/0, clean build 9.1 s).

- **Shipped this run:** virtualize-long-lists → **brief 31**; the xlsx slice of
  office-parsing-blocks-ui-thread (PERF-6) → **brief 32**; and — its trigger met
  by Monaco landing this run — the held eager-bundle-lazy-load → **brief 33**
  (eager gzip 399.6 → 121.5 KB). All three committed, gates green.
- **Full-auto daily-driver backlog (briefs 34–46): COMPLETE (2026-07-18).**
  34 notification-center (CORE); Wave C light apps 35–40 (6-agent batch,
  `a7632ab`); Wave D heavy/backend 41–44 (4-agent opus batch + 3 adversarial
  security reviews + 4 hardening fixes, `4be1777`); Wave E platform 45–46
  (2-agent batch, `3e72333`). Desktop is **23 apps** (Wave E added CORE surfaces
  — a palette search source + a Settings "Apps" section — not new app windows);
  backend gained git / http-proxy / archive / files-search surface (all authed +
  jailed, **135 backend tests**). Every gate green at each commit; one commit per wave + a
  `docs(corpus)` per wave. The entire "everything actionable" scope the run was
  chartered with is now shipped.
- **Remaining = the human-gated exclusions only** (never in the auto-run's
  scope): SEC-9 `csp-connect-src-ws-wildcard`, SEC-10 `kiosk-no-sandbox`
  (browser/ISO-gated), and brief 15's v1-release remainder (friend QA, VPS
  deploy, accent pick, dep bumps, tag). Plus the per-brief human walkthroughs
  noted in each row above. These stay **human-gated — do NOT build
  autonomously.**

## 2026-07-31 — Improvement sweep: 3 production bugs fixed, briefs 52-86 written

Ran the OS locally + a scripted walkthrough of all 23 desktop icons. **Three
bugs live in the shipped artifacts**, all invisible in development — which is
why they survived review — fixed and merged: System Monitor's process table was
empty in every image (procps `ps` vs busybox → now a `/proc` walk); the Git app
was dead in container and ISO (`git` installed in neither); core's `Tooltip`
emitted nested `<button>`s across 33 sites. Also: the repo could not
`npm install` under its own declared npm 11, and `format:check` was red twice.
Backend 135→147. **Briefs 52-86 (35, ungrilled)** — 52-54 platform, 55-78 one per
app (all 24), 79-86 parity — are listed with their dependency order in
[backlog-2026-07-31.md](backlog-2026-07-31.md), rejections in
[real-os-gaps.md](real-os-gaps.md), house style in
[ui-conventions.md](ui-conventions.md).

## 2026-07-19 — Web browser + containerized dev pipeline (grilled)

Two briefs from a research+grill session ("add a web navigator"). Both **todo**.

- **Brief 50 — web browser (proxied-interactive): todo.** HARD. Tier-2 proxy
  via **Scramjet** (prebuilt dist, AGPL, no Rust); OS-capability housing
  (backend Wisp module + core SW/`<ProxyView>` + thin add-on); **auth-gate +
  SSRF filter** (blocks private ranges — the stricter opposite of brief 43);
  OS-level encrypted profile sync; thin MVP (Google + YouTube, reuse Bookmarks);
  DRM out. Scoped CSP additions (SEC-9). Depends on 51. Security-review gated.
- **Brief 51 — containerized dev pipeline + Dockerfile de-stale: todo.** MEDIUM.
  `npm run dev` → `docker compose --profile dev watch` (sync `apps/**`, ignore
  node_modules); de-stale the `deps`/`proddeps` manifest lists (7-of-24 rot —
  the real "contained" blocker); host tooling = Node/npm via `npm install
  --ignore-scripts`. Prod path unchanged. Unblocks brief 50.
