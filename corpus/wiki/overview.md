---
summary: What ImbatranimOS is — a recreational, Windows-inspired, lightweight Ubuntu-based distro to share with friends — and the paths that were rejected.
updated: 2026-07-16
---

# Overview

**ImbatranimOS** is a recreational operating system project: a user-friendly,
Windows-inspired, lightweight daily driver for basic needs (browsing, audio,
apps), built to be shared with friends as an installable ISO. The goal is the
**brand/product** — friends install and use a thing called ImbatranimOS — not
kernel-level systems learning.

The model is the proven Ubuntu-remix path (Zorin OS, AnduinOS, Linuxfx): take
a solid base, own the experience layer. Notably AnduinOS is a one-person
hobby project that ships a convincing Windows-like desktop — the calibration
point for what one motivated person can maintain.

## Rejected paths (researched 2026-07-16)

- **Build above MS-DOS** — legal (Microsoft MIT-licensed 1.25/2.0/4.0) but a
  16-bit dead end: no modern drivers, networking, or browser. ReactOS's 30
  years of alpha is the calibration for "Windows-like OS from scratch."
- **Windows optimization wizard** — debloat scripts are fine for personal
  use, but redistributing a modified Windows ISO violates Microsoft's EULA;
  sharing only a script isn't "an OS."
- **From scratch / Linux From Scratch** — a learning exercise, not something
  you can responsibly hand to friends.

## Audience

Tech-tolerant friends on mixed hardware who want a simple daily driver.
Standard Windows-like UX — not an accessibility-first OS for elderly users
(despite the Romanian name meaning "we're getting old").

## Where things live

The repo is (will be) the distro: build scripts, package lists, and configs
that produce the ISO locally. See [architecture.md](architecture.md) for the
stack and [status.md](status.md) for where things stand.
