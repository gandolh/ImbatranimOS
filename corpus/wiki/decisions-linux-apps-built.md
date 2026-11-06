---
summary: Linux apps calls made with the owner once the layer was built (grilled 2026-11-03) — a Terminal's background jobs live with the session (revising 2026-10-23's hang-up rule, since BusyBox sh passes no SIGHUP to jobs), installs, removals and launches only from the tab that holds the session, no window zoom while a Linux window is open (Chromium's renderer crashed beside one), and no CJK font in the image. Grilled again 2026-11-04: a tray volume over all sound (reversing the 2026-07-31 rejection), Linux apps on the VPS in a capped container, and the zoom beside Linux windows stays off for good. 2026-11-05: the session bus is Alpine's dbus, and the backend speaks D-Bus with a client of its own; Xwayland, for X11 apps, isn't in the image but comes with the first app that speaks X11. 2026-11-06: the Wayland host is each session's sound server, speaking PulseAudio's protocol itself, since PulseAudio or PipeWire would add about 250 MB to the image. Also 2026-11-06: Settings → Updates moves the nixpkgs pin at runtime in the user flake registry on the /nix volume, keeps two pins, goes back by rolling the profile back, and an image whose pin is at least as new wins.
updated: 2026-11-06
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

## Xwayland comes with the first app that speaks X11
_2026-11-05_ — Xwayland isn't in the image. The Linux apps pane installs it
into a profile of its own (`imbatranim-xwayland`) right after an install
that leaves libX11 in the user's profile, and removes it after a removal
that leaves none. Measured at the pin while building brief 31: 155 paths,
421 MiB unpacked, a 126 MiB download, nearly all of it beyond the base
profile (libdecor brings GTK 3 and systemd), and 5 MiB beyond Firefox's
closure.
Rejected: the base profile in the image (421 MiB against the ~150 MB
target); installing it when the first X client connects (a 126 MiB download
while the app waits for its display); installing it with every app (420 MiB
for an app that speaks only Wayland, such as foot); installing it only with
apps that speak X11 alone (libX11 but no libwayland), which misses apps that
speak both and still pick X11, such as older Electron apps.
**Why**: the image stays slim, an X11 app pays for X11 when it first needs
it, and an app that already carries GTK pays almost nothing.

## The Wayland host is each session's sound server
_2026-11-06_ — Linux apps' sound (brief 39) needs a sound server per session.
No daemon runs for it: the Wayland host listens on a socket per session and
speaks PulseAudio's native protocol there (the `pulseaudio` crate reads and
writes the messages), mixes the session's streams itself, and encodes the
mix as Opus with libopus linked into the binary. Apps reach it through
`PULSE_SERVER`, which the backend sets beside `WAYLAND_DISPLAY`. Measured
while building it: the host binary grew 0.64 MB, the runtime image nothing;
the build stage needs cmake and make.
Rejected, both named by the brief: Alpine's PulseAudio, or PipeWire with
`pipewire-pulse` and WirePlumber, each about 256 MiB installed in the image,
because mesa, llvm and gstreamer (or libcamera) come with them; Nix's
PulseAudio in the base profile, a 245 MiB closure. Also rejected: a daemon
built from source without those parts (a C build stage to keep up, and the
host would still have to read its output and encode it).
**Why**: Firefox, and Linux apps generally, only need the protocol on a
socket; an existing server would cost more than the Nix layer itself against
the slim image. The host already runs per session, starts and stops with it
and sleeps with it, so one stream, mixed in the container (the owner's call
of 2026-11-04), costs nothing more to run.

## Updates move the pin at runtime, in the user registry
_2026-11-06_ — Settings → Updates (brief 43) moves the nixpkgs pin without a
new image. The moved pin lives in the user flake registry,
`$NIX_CONFIG_HOME/registry.json` on the /nix volume, which Nix reads before
the image's system registry, with a record beside the package lists
(`linux-apps/pins.json`). A move rebuilds every installed app with
`nix profile upgrade`, keeps the old pin's profile generation, and deletes
every other one before a `nix store gc`, so two pins are on disk and never
three. Go back is `nix profile rollback` to that generation. At boot an image
whose pin is at least as new as the moved one wins, and the move and its Go
back are dropped.
Rejected: writing the image's `/etc/nix` files (root-owned; the shell user
has no root); passing a locked `github:` ref to every install (the Terminal's
`nixpkgs#…` would still get the image's pin, and `nix profile upgrade` never
moves a locked ref); Go back as "registry back, upgrade again" (the old pin's
nixpkgs source is collected after a move, so it downloads again, and it
keeps apps installed since, which isn't the state the owner went back to).
**Why**: the owner wants fixes without rebuilding the image, an undo, and
the image to stay the floor (grill 2026-11-04).
- *Consequence*: Free space (`nix-collect-garbage -d`) deletes the kept
  generation, and Go back goes with it.
- *Consequence*: after a new image whose pin wins, the installed apps stay
  at their old commit until the next Update, as they always did.

The calls of 2026-11-06 on the phone's keyboard, Open with and the Settings
portal (briefs 45-47) are in
[decisions-linux-apps-input-files-look.md](decisions-linux-apps-input-files-look.md).
