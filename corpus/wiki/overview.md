---
summary: What ImbatranimOS is after the 2026-07-16 pivot — a real Alpine container whose desktop is a React web app — plus the project's lineage and audience.
updated: 2026-07-16
---

# Overview

**ImbatranimOS** is a recreational "OS" that pivoted from an installable
Linux distro to something funnier and more shippable: **a real little
computer whose screen is a browser tab.** A slim Alpine-based Docker
container runs a real Linux userland and a NestJS server; the entire
graphical layer is a React + Vite web desktop served from the container.
The browser terminal is a real shell on the box (option "B: real OS,
browser = screen" — not a simulation). The name stays: *„îmbătrânim"*,
Romanian for "we're getting old," a joke about time passing that computes.

## Lineage

1. **ISO era (2026-07-16, one day long).** Originally an Ubuntu
   26.04 + LXQt installable distro. Three grilling sessions locked a full
   spec; the build pipeline (debootstrap-in-Docker + C driver on nob.h) was
   proven with a passing smoke test and a compiling driver before the pivot.
   Superseded briefs and the log preserve the record; the code was deleted
   uncommitted by explicit choice.
2. **Web-OS era (2026-07-16 →).** Fork of the user's own
   [minimal-web-desktop](https://github.com/gandolh/minimal-web-desktop)
   (React/Vite/TS + Tailwind + Framer Motion, NestJS, SQLite), evolved into
   ImbatranimOS: system apps added (real terminal, real files, system
   monitor), reskinned to the carried-over identity (Windows-7-classic
   layout, black & white + accent).

## Audience & the finish line

Tech-tolerant friends. The **friend-run bar** replaces the old
friend-install bar: a friend with Docker runs one documented command, opens
the browser, logs in, and uses the terminal/files/notes — no help from you.
Instances are **internet-exposable by design** (VPS or port-forwarded home
box), which is why auth is real from day 1.

## Where things live

Stack and container layout: [architecture.md](architecture.md). All locked
choices: [decisions.md](decisions.md). Current state:
[status.md](status.md).
