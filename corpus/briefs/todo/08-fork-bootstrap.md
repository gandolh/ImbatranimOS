# Task 08 — Fork bootstrap: import minimal-web-desktop, prune, run

## Context

First brief of the web-OS era (see corpus/wiki/decisions.md). Frontend +
backend start as a fork of https://github.com/gandolh/minimal-web-desktop
(default branch `main`). Recon done 2026-07-16 (grilling); findings baked
into the decisions below so this brief is unambiguous.

**Fork facts (verified via GitHub API):**
- Layout: `apps/frontend`, `apps/backend`, `infrastructure/docker-compose.yml`.
- Two containers today: frontend (Vite, :5173) + backend (Nest, :3001),
  wired by `VITE_API_URL` / `FRONTEND_URL`.
- Persistence: bind-mount `../data`, SQLite at `/data/db.sqlite`.
- Frontend stack: React + Vite + Tailwind v4, Framer Motion, Base UI,
  Zustand, TanStack Router + Query, react-hook-form + Zod, axios, dayjs,
  **xterm + @xterm/addon-fit + addon-web-links already present**.
- Carries its OWN `corpus/`, `CLAUDE.md`, `.agents/`,
  `UBIQUITOUS_LANGUAGE.md` — these COLLIDE with our corpus.

## Decisions locked for this brief (grilling 2026-07-16)

- **Keep the fork's layout**: `apps/frontend`, `apps/backend`,
  `infrastructure/`. Our architecture.md is updated to match (no
  restructure). Adjust only if a real need appears.
- **Import code only**: bring `apps/` + `infrastructure/`. **Drop** the
  fork's `corpus/`, `CLAUDE.md`, `.agents/`, `UBIQUITOUS_LANGUAGE.md` — our
  corpus is the single source of truth. Mine them for useful domain facts
  FIRST, fold anything worth keeping into our wiki, then delete.
- **Container topology is brief 09's job**, but the target is settled:
  one multi-stage Dockerfile, DEV target = Nest + Vite HMR (2 ports),
  PROD target = Nest serves built statics (1 port, slim). This brief keeps
  the fork's 2-container dev compose working; 09 does the collapse.
- **Terminal (xterm) already exists — investigate, don't assume.** Read
  `apps/backend` to learn whether a real PTY bridge already backs xterm or
  it's decoration. Record the finding in wiki/open-questions.md (or a note
  in status.md) and adjust brief 11's scope accordingly (harden+reskin vs
  build-fresh). Do NOT delete the terminal in this brief.

## Files you OWN

- `apps/frontend/`, `apps/backend/` (imported fork)
- `infrastructure/docker-compose.yml` (dev bring-up)
- Root `package.json` / workspace wiring if it helps
- `.gitignore` (already web-era; extend as needed)

## Files you must NOT touch

- `corpus/` beyond folding findings via the normal flow
- No reskin (14), no new apps (11–13), no auth (10), no image work (09)

## What to do

1. Import `apps/` + `infrastructure/` into this repo, preserving upstream
   git history if practical (subtree/`git-filter-repo`; plain copy is
   acceptable — record the exact upstream commit hash in log.md either way).
2. Delete the fork's `corpus/`, `CLAUDE.md`, `.agents/`,
   `UBIQUITOUS_LANGUAGE.md` after mining them for useful facts.
3. Prune apps: remove **docker desktop** and **service launcher** and
   their backend modules. Keep sticky notes, todo, bookmarks, notepad, the
   shared window-manager/file-service infra, AND the xterm terminal
   (pending the investigation above). Note anything unexpectedly entangled
   in wiki/open-questions.md.
4. Make the SQLite path env-configurable (it must later live under
   `/home/imbatranim` per decision).
5. Verify the dev loop via the fork's 2-container compose: desktop loads,
   the surviving apps work, HMR works.
6. Report the terminal-investigation finding and its effect on brief 11.

## Acceptance

Fresh clone + `docker compose -f infrastructure/docker-compose.yml up`
(or documented dev command) → desktop in browser with sticky notes, todo,
bookmarks, notepad functional and HMR live; docker-desktop and
service-launcher gone from UI + backend; fork's corpus/CLAUDE/.agents
removed; upstream commit hash and the terminal finding recorded in log.md.
