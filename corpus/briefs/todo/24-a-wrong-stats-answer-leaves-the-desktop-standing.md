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
