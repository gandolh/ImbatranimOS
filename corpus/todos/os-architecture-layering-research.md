---
title: Research the OS architecture — layer the system (render vs OS/session) for a strong foundation
created: 2026-07-19
status: open
tags: [architecture, platform, research, foundation]
---

# Research the OS architecture — layer the system for a strong foundation

Research how to structure the logic of the OS so it stays maintainable as it
grows. The instinct: split it into clean **layers** — e.g. a rendering layer
and an OS/session layer — rather than one React app that does everything.
Concretely, the questions to answer:

- Should the **server own session/state management** (which apps are open,
  window layout, the "logged-in desktop session") and the **UI be responsible
  only for rendering** that state? Today window layout and icon positions live
  in the browser (zustand + localStorage); the desktop session is effectively
  client-side.
- Can we borrow the **display-server model from real Linux** — a compositor /
  protocol boundary like Wayland or X11 — and write our *own* small equivalent
  that mediates between "the apps" and "the screen (browser tab)"? What's the
  right seam: a protocol the apps speak, with the core as the compositor?
- Should **add-ons become real packages** — a package/manifest format,
  install/enable lifecycle, maybe sandboxing — instead of build-time workspace
  imports wired through `manifest.ts`?
- **Inspire from how real Linux distributions handle the OS**: kernel vs
  userland vs display server vs package manager vs session manager — which of
  those boundaries map usefully onto a browser-desktop-over-a-container, and
  which are cargo-culting.

The goal is a strong architectural foundation that keeps the code maintainable
as the number of apps and features grows.

## Context

Where things stand today (see [architecture.md](../wiki/architecture.md)):
one NestJS container is the computer; one port serves the React/Vite desktop
(`@imbatranim/core`) + the API/WS; add-ons are npm-workspace packages, each
exporting an `AppConfig`, composed at **build time** through the single
`apps/core/src/manifest.ts` (the only file allowed to import add-ons,
eslint-enforced). Session/auth is server-side (sessions + cookie), but the
**desktop session** (open windows, layout, icon positions) is client-side
state. The "install new packages without sudo" question is already flagged open
in [open-questions.md](../wiki/open-questions.md), and the runtime add-on
enable/disable toggle is captured in [addon-manager](addon-manager.md) — this
research is the bigger frame around both.

This is deliberately a **research/design** todo, not an implementation brief. It
likely reopens locked decisions in [decisions.md](../wiki/decisions.md)
(single-container, build-from-source, client-rendered desktop), so treat any
outcome as a decisions.md revisit + `log.md` entry, per the corpus rules.

## Grill me before committing to a design

**Reminder to the assistant:** when this gets promoted toward a brief/plan, do
**not** just accept the framing above and start designing. Run the `grill-me`
skill (`personal-skills:grill-me`), or an equivalent hard interrogation, first —
push back on every branch: *do we actually need a client/server split, or is
this over-engineering a single-user desktop? What breaks if the server owns
session state (offline? latency? reconnection?)? Is a home-grown
Wayland/X11-alike worth the complexity vs. keeping windows as React components?
What concretely is painful about `manifest.ts` today that a package system
fixes?* Grill me until the decision tree is resolved and the foundation is
justified by real pain, not architecture aesthetics. Only then write the brief.

From the 2026-07-19 architecture-direction conversation.
