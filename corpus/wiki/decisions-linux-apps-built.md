---
summary: Linux apps calls made with the owner once the layer was built (grilled 2026-11-03) — a Terminal's background jobs live with the session (revising 2026-10-23's hang-up rule, since BusyBox sh passes no SIGHUP to jobs), installs, removals and launches only from the tab that holds the session, no window zoom while a Linux window is open (Chromium's renderer crashed beside one), and no CJK font in the image. Grilled again 2026-11-04: a tray volume over all sound (reversing the 2026-07-31 rejection), Linux apps on the VPS in a capped container, and the zoom beside Linux windows stays off for good. 2026-11-05: the session bus is Alpine's dbus, and the backend speaks D-Bus with a client of its own.
updated: 2026-11-05
---

# Decisions: Linux apps, after the build (2026-11-03)

Settled with the owner on 2026-11-03, once briefs 01-06 were built and
walked; the outcomes in `corpus/briefs/done/` have the evidence. The calls
from the 2026-10-23 grilling are in
[decisions-linux-apps.md](decisions-linux-apps.md). Changing one needs an
explicit revisit and a `log.md` entry.

## A Terminal's background jobs live with the session
_2026-11-03_ — Revises the hang-up rule of 2026-10-23. A Linux app started
in the foreground of a Terminal ends with its shell, as before. One started
with `&`, `setsid`, `nohup` or `disown` lives as long as the tab's desktop
session, like one started from Start: a reload finds it again, and closing
the tab stops it 30 s later. That is what the machine does: the Terminal's
shell is BusyBox `sh`, which passes no SIGHUP to its background jobs when
it hangs up (brief 06's outcome has the test).
Rejected: having the PTY's end hang up every process group in its shell's
session, which keeps the 2026-10-23 rule at the cost of a PTY change; and
making the Terminal's shell bash, which passes SIGHUP on, adding bash to the
image and changing every Terminal's shell.
**Why**: a reload shouldn't kill an app you started, and the session's end
already stops everything the session started, so nothing is left behind.
- *Consequence*: `docs/architecture.md` says so where the Terminal is
  described.

## Changes and launches come only from the tab that holds the session
_2026-11-03_ — In the Linux apps pane, installing, removing and Free space,
and starting a Start entry, carry the calling tab's desktop session id, and
the backend refuses them unless that session's `/api/wayland` socket is
open. Reading (search, the installed list, the running job and its log, the
store's size) needs only the sign-in.
Rejected: showing a job's state and log only to the tab that started it.
**Why**: an app shows in the tab whose session runs it, so only a tab that
has a session can sensibly start one, and one job at a time is the machine's
anyway.

## No zoom while a Linux window is open
_2026-11-03_ — While any Linux window is open, OS windows open and close
with the fade alone; Linux windows always do. Everywhere else the zoom
stays.
Rejected: the fade for every window always (one look, and no crash seen
without any zoom); and keeping the zoom, accepting the crash.
**Why**: Chromium's renderer crashed (the whole tab, headless and full
builds, with or without a GPU) when a window's zoom ran beside a Linux
window that was drawing; without the zoom it stopped, but for 1 in 5 when
an app opened beside a playing video (brief 04's outcome). Chrome with a
GPU may not crash at all; when that is checked, the zoom can come back.

## No CJK font in the image
_2026-11-03_ — The base profile keeps DejaVu alone, so Chinese, Japanese and
Korean text shows as boxes until a CJK font is installed. The image's
fontconfig already reads the user's profile, so installing one from
Settings → Linux apps (`noto-fonts-cjk-sans`, 65 MB, or `wqy_microhei`,
5 MB) is enough.
Rejected: WenQuanYi Micro Hei in the base profile (5 MB, lower quality),
Noto Sans CJK in it (65 MB, about 13% more image).
**Why**: the slim image, and a font is one install away for whoever needs
it.

## A tray volume over all of the OS's sound
_2026-11-04_ — The tray gets a volume slider and a mute that apply to every
sound the OS makes: the media player add-on and the Linux apps' stream
(briefs 39 and 40). This reverses [real-os-gaps.md](real-os-gaps.md)'s
2026-07-31 rejection of a global volume, which said to revisit once a second
sound source existed; Linux sound is that source.
Rejected: no OS volume at all (the browser's tab mute and the computer's
volume), and a mute for Linux sound alone.
**Why**: the owner wants one place to turn the OS down, now that two things
in it make sound.

## Linux apps on the VPS, in a capped container
_2026-11-04_ — Linux apps are turned on for the VPS, and vps-deploy caps the
whole imbatranimOS container for CPU and memory so it can't take the other
services' share (brief 44 measures and proposes the numbers). Nothing inside
the OS limits sessions or apps.
Rejected: off until a bigger box; on with no cap; per-session and per-app
limits inside the OS.
**Why**: one Firefox window is 0.5-0.6 GB and the box had 2.1 GiB free on
2026-11-04; a cap at the container keeps a heavy page from slowing every site
on the box, without new limits in the OS.

## The zoom beside Linux windows stays off
_2026-11-04_ — The owner dropped the check with a GPU Chrome; the fade-only
rule above is final, and its todo is closed.

## The session bus comes from Alpine, and the backend speaks D-Bus itself
_2026-11-05_ — Each tab's session bus is Alpine's `dbus` package in the image
(about 0.7 MB, its setuid system-bus helper removed), and the backend answers
`org.freedesktop.Notifications` through a small D-Bus client of its own
(`linux-apps/dbus/`, about 600 lines with the wire format), both the owner's
calls while building brief 42.
Rejected: Nix's `dbus` in the base profile (an 80 MiB closure, systemd-minimal
and glibc) or installed on first use (free while Firefox is installed, an
80 MiB download otherwise, and removable by a clean-up); the npm libraries
`@homebridge/dbus-native` (maintained, six dependencies) and `dbus-next`
(unmaintained since 2022).
**Why**: the bus is infrastructure every session needs at once, so it
belongs in the image at the smallest size; and the backend only has to serve
one interface, which a short, tested client does without adding a supply
chain to the server.
