# Task 13 — System monitor: the machine's vitals in a window

## Context

Third system app (decisions: v1 apps). Real CPU/RAM/disk/process data from
the container — cheap to build, sells the realness. Depends on 08/10.
While here, resolve the "app install without sudo" open question's v1
stance (likely: document that the Linux side is fixed; web apps are the
app story) — record it in wiki/decisions.md.

## Files you OWN

- Backend metrics endpoint(s) (procfs reads or systeminformation pkg:
  CPU %, memory, disk usage of the home volume, process list)
- Frontend System Monitor app (live-updating gauges + process table,
  htop-flavored, B&W-friendly)

## What to do

1. Poll-based metrics API (or WS push) — 1–2s cadence, cheap on the box.
2. Process table: pid, name, cpu, mem; kill button for imbatranim-owned
   processes only.
3. Uptime + "computer" identity touches (hostname, kernel, image
   version) — the About panel of the OS.
4. Record the app-install-story decision in decisions.md + log.

## Acceptance

Monitor shows live truthful data (spot-check against `top` in the
Terminal app); killing a process you own works and is scoped (attempting
another uid's process fails); auth required; the app-install stance is
recorded.
