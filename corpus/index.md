# ImbatranimOS corpus — index

Start here. Triage on the summary lines; open at most 2–3 pages.

- [CLAUDE.md](CLAUDE.md) — the rules and conventions for this corpus
- [routing.md](routing.md) — intent/knowledge routing for work-intake
- [log.md](log.md) — chronological record of meaningful changes

## Wiki

- [architecture](wiki/architecture.md) — Web-OS era stack — Alpine + NestJS container, one authed port, React/Vite desktop split into @imbatranim/core + add-on packages (npm workspaces + turbo), PTY/FS/monitor apps, volume-backed home.
- [decisions](wiki/decisions.md) — Locked choices of the web-OS era (2026-07-16 pivot grilling) plus the 2026-07-17 office-suite/post-v1 set, the 2026-07-18 REST-client SSRF stance, and a compressed record of the superseded ISO-era decisions — do not relitigate without an explicit revisit and a log entry.
- [open-questions](wiki/open-questions.md) — Web-OS era unknowns — app-install story without sudo, HTTPS in-app vs proxy, accent pick, image size reality, registry publishing, fork prune surprises.
- [os-layering](wiki/os-layering.md) — The OS-as-layers design (2026-07-19 grilling) — three layers (kernel/userland ↔ compositor/display ↔ apps), an injected `system` capability handle as the app↔OS protocol seam, the `@imbatranim/ui`-library vs capabilities bisection, and the kill-list of real-Linux daemons we deliberately do NOT build. Briefs 47 (error boundaries) + 49 (session/dotfile split) shipped 2026-07-24; brief 48 (the seam itself) is the remaining step.
- [overview](wiki/overview.md) — What ImbatranimOS is after the 2026-07-16 pivot — a real Alpine container whose desktop is a React web app — plus the project's lineage and audience.
- [status](wiki/status.md) — Dated snapshot — web-OS era; briefs 08–14 + 16–47 + 49 + 51–54 DONE. 2026-07-24 run shipped the OS-layering trio's ready slice — 47 per-window error boundaries (a crashing app can't take down the desktop), 49 ephemeral per-tab sessions + server-side dotfile prefs (new auth-guarded backend prefs module; cross-tab stomp gone), 51 containerized dev via compose watch (npm run dev fully in-container; docs/packages npm-ci gap fixed). Desktop = 23 apps; 143 backend + 24 core tests. Remaining todo: 48 protocol seam (now unblocked-by-preference), 50 browser (unblocked by 51), 55 marketplace (needs 48), 15's human-gated v1 remainder + per-brief walkthroughs.

## Work

- Brief states live one-per-line in [wiki/status.md](wiki/status.md);
  specs in [briefs/](briefs/), captures in [todos/](todos/).
