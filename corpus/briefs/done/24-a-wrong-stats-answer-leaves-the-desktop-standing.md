# Brief 24 — A wrong stats answer leaves the desktop standing

## Context

Found on 2026-10-31 while retaking the README images from a host run. With
`VITE_API_URL` unset, the desktop's REST calls go to `/prefs` and the like
instead of `/api/...`. The tray then receives a body that is not a stats
object, reads `stats.cpu.percent` from it, and the error unmounts the whole
tree: the page stays black with no message. React's console names `<Tray>`
and suggests an error boundary.

The missing variable is now in `docs/getting-started.md`; the crash is
still there. The dev container sets `VITE_API_URL=/api` in
`infrastructure/docker-compose.yml`, so it never shows there.
`apps/core/src/shared/components/taskbar/Tray.tsx` renders
`stats.cpu.percent` and `stats.memory.*` whenever `stats` is truthy.
Promoted from the todo `tray-crash-on-a-wrong-api-base`.

## Spec

1. In `Tray.tsx`, check the stats answer's shape (the numbers it reads are
   numbers) before drawing the CPU and memory text; on anything else, draw
   the tray without it. The disk warning gets the same check.
2. A failed request (network error, non-2xx) does the same.
3. No error boundary is needed for this; if one is added round the tray as
   well, it must keep the rest of the taskbar drawing.

## Acceptance

- A test feeds the tray an HTML body, an empty object and a failed request:
  each leaves the tray without its CPU and memory text and throws nothing.
- With `VITE_API_URL` unset on a host run, the desktop draws.
- Typecheck, lint and the tray's tests pass.

## Files you OWN

- `apps/core/src/shared/components/taskbar/Tray.tsx`
- its test file

## Outcome (2026-11-03)

**Built in `7f4c520` (version 1.111.0).**
- `readTrayStats` (new `taskbar/trayStats.ts`, beside the tray, because the
  react-refresh rule wants components alone in `Tray.tsx`) reads the answer
  as `unknown`. CPU and memory draw only when `cpu.percent`,
  `memory.usedBytes` and `memory.totalBytes` are finite numbers; the disk
  warning reads `disk.percent` on its own. A failed request leaves `data`
  undefined, which reads as nothing too. No error boundary was added.
- **Beyond the brief's files:** with the tray fixed, the host run blanked
  again in Sticky Notes' desktop layer (`DesktopNotes.tsx`), which called
  `.filter` on the same HTML. It now takes only an array. Desktop layers have
  no error boundary, so either crash took the desktop down; filed as the
  todo `desktop-layers-have-no-error-boundary`.

**Checked:**
- `Tray.test.tsx` (8): a stats answer draws `12% · 2.0/8.0 GB`; an HTML page,
  an empty object, a half answer, strings for numbers, null and a rejected
  request each draw the tray without the text and throw nothing; a 95% disk
  warns once. The reader on non-objects and a disk-only answer.
- A host run: Vite on the host with `VITE_API_URL` unset, the backend in the
  dev container. `/system/stats` answered `200 text/html`; the desktop drew
  its icons, wallpaper and taskbar, the tray without CPU and memory, and a
  "Couldn't save your settings" toast (the prefs write also missed). Before
  the Sticky Notes fix the same run logged
  `(notes ?? []).filter is not a function` and stayed blank.
- Typecheck, lint, and core's taskbar tests (15) and Sticky Notes' (17) pass.
