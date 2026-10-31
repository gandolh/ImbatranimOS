---
title: The tray takes down the desktop when the API answers with something other than stats
created: 2026-10-31
status: open
tags: [core, taskbar, robustness]
---

# The tray takes down the desktop when the API answers with something other than stats

Found on 2026-10-31 while retaking the README images from a host run. With `VITE_API_URL` unset, the desktop's REST calls go to `/prefs` and the like instead of `/api/...`. The tray then receives a body that is not a stats object, reads `stats.cpu.percent` from it, and the error unmounts the whole tree: the page stays black with no message.

The missing variable is now in [docs/getting-started.md](../../docs/getting-started.md). The crash itself is still there.

## Context

- [Tray.tsx](../../apps/core/src/shared/components/taskbar/Tray.tsx) renders `stats.cpu.percent` and `stats.memory.*` whenever `stats` is truthy.
- React's console names the `<Tray>` component and suggests an error boundary.
- The dev container sets `VITE_API_URL=/api` in `infrastructure/docker-compose.yml`, so it never shows there.

## Acceptance

A wrong or failed stats answer leaves the tray without its CPU and memory text, and the rest of the desktop still draws.
