# Brief 100: Hidden windows stop polling

**Depends on:** nothing. **Runs after:** 99.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md)
("Already fine, and what doesn't carry over").

## Context

- A minimized window, or one on another workspace, stays mounted under
  `display: none` (`apps/core/src/shared/components/window/Window.tsx`).
  The browser keeps running its timers and TanStack Query's
  `refetchInterval`: `refetchIntervalInBackground` and browser throttling only
  react to the whole tab being hidden, not to one window.
- Ghostty 1.4 stops rendering hidden tabs and frees their GPU memory; the same
  idea here is that a window nobody can see does no periodic work for itself.
- The kit already has `useWindowVisible` (`packages/ui/src/index.ts`); only
  System Monitor uses it.
- Polls found on 2026-11-20 (`setInterval` and `refetchInterval` across
  core and the add-ons):
  - Logs' follow mode, one request every 3 s (`apps/add-ons/logs/src/Logs.tsx`).
  - Settings' job polls while a job runs: Updates (1 s), Marketplace (2 s),
    Linux apps index (2 s) and job (1 s).
  - Not window work, so they stay: Clock alarms and Calendar reminders
    (background services), the tray clock, the marketplace server lease, the
    Snipping Tool's countdown.

## Decisions

1. **A poll that only feeds its own window pauses while the window is
   hidden**, and runs once at once when the window shows again, so what you
   see is fresh. Background services and the shell's own parts keep running.
2. Written down as a rule in `wiki/ui-conventions.md`, so new apps follow it.

## Files you OWN

- `apps/add-ons/logs/src/Logs.tsx`; the Settings modules with the job polls
  (`apps/core/src/modules/settings/UpdatesSettings.tsx`,
  `MarketplaceSettings.tsx`, `LinuxAppsSettings.tsx`); their tests.
- Corpus: `wiki/ui-conventions.md`, `wiki/status.md` (append to a line),
  `log.md`.

## What to do

1. A test per poll that fails today: with the window hidden, no request for
   10 s of fake time; shown again, one request at once.
2. Gate each poll on `useWindowVisible`.
3. The ui-conventions rule, with the exceptions above named.
4. In the dev container, follow Logs, minimize it for 30 s, and count
   `/api/logs` requests in the network panel (none while minimized).

## Acceptance

- [ ] No listed poll runs while its window is hidden; each refreshes once on
  show.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
