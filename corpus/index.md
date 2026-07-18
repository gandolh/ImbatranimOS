# ImbatranimOS corpus — index

Start here. Triage on the summary lines; open at most 2–3 pages.

- [CLAUDE.md](CLAUDE.md) — the rules and conventions for this corpus
- [routing.md](routing.md) — intent/knowledge routing for work-intake
- [log.md](log.md) — chronological record of meaningful changes

## Wiki

- [architecture](wiki/architecture.md) — Web-OS era stack — Alpine + NestJS container, one authed port, React/Vite desktop split into @imbatranim/core + add-on packages (npm workspaces + turbo), PTY/FS/monitor apps, volume-backed home.
- [decisions](wiki/decisions.md) — Locked choices of the web-OS era (2026-07-16 pivot grilling) plus the 2026-07-17 office-suite/post-v1 set, the 2026-07-18 REST-client SSRF stance, and a compressed record of the superseded ISO-era decisions — do not relitigate without an explicit revisit and a log entry.
- [open-questions](wiki/open-questions.md) — Web-OS era unknowns — app-install story without sudo, HTTPS in-app vs proxy, accent pick, image size reality, registry publishing, fork prune surprises.
- [overview](wiki/overview.md) — What ImbatranimOS is after the 2026-07-16 pivot — a real Alpine container whose desktop is a React web app — plus the project's lineage and audience.
- [status](wiki/status.md) — Dated snapshot — web-OS era; briefs 08–14 + 16–44 DONE (incl. the 2026-07-17 post-v1 backlog run, the review-pass cleanup wave 23–30, the daily-driver perf trio 31–33 which cut the eager bundle −69.6%, the CORE notification center 34, Wave C's six daily-driver apps 35–40, and Wave D's four heavy/backend apps 41–44: Monaco code-editor, git-gui, REST client, archive-manager — the latter three added authed+jailed backend modules, security-reviewed + hardened; desktop now 23 apps, 126 backend tests). Brief 15's human-gated remainder is all that stands before v1.0. Full-auto backlog is now at Wave E (45 global-search-launcher, 46 addon-manager). Held human-gated: SEC-9 CSP + SEC-10 kiosk sandbox (browser/ISO-gated), brief 15 v1-release remainder.

## Work

- Brief states live one-per-line in [wiki/status.md](wiki/status.md);
  specs in [briefs/](briefs/), captures in [todos/](todos/).
