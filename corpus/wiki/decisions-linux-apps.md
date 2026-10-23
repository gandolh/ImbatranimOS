---
summary: Linux GUI apps run in the container and show as ordinary OS windows; their windows reach the tab as pixels, narrowing os-layering's "data, never pixels". Our own Wayland host in Rust (smithay) does the Wayland part, the backend relays it over the signed-in WebSocket, and the compositor stays in the browser. The OS stays Alpine; Linux apps come from Nix, installed by the user at runtime without sudo, reversing the build-time-only app stance. An app lives with its tab, survives a reload, and sleeps (SIGSTOP) under the idle cover screen. Firefox is the first app; Spotify was dropped. Settled with the owner 2026-10-23 in the Spotify grilling.
updated: 2026-10-23
---

# Decisions: Linux apps in OS windows (2026-10-23)

Settled with the owner on 2026-10-23. The session started as "run Spotify on
the OS" and widened to a general layer. Later the same day the owner dropped
Spotify; Firefox is the first app.
Changing one needs an explicit revisit and a `log.md` entry.

## Linux apps show as OS windows, and their windows travel as pixels
_2026-10-23_ — A Linux GUI program running in the container shows its windows
as normal OS windows, with the desktop as its only screen. There is no X11 or
Wayland display anyone looks at; the browser tab is the display. This narrows
the rule in [os-layering.md](os-layering.md) that the server streams data and
never pixels: web apps still get data, and a Linux app's window arrives as its
image.
Rejected: keeping the rule and doing Spotify alone, either as a headless
Spotify Connect daemon (librespot) driven by our own UI, or as our own UI on
Spotify's Web Playback SDK.
**Why**: the owner wants the OS to run real Linux GUI apps, not only web
ones. Modern toolkits (GTK, Qt, Chromium) draw the whole window inside the app
and hand the display a finished image, so per-window pixels are the only thing
a display can receive. No drawing-command protocol is left to implement. GTK's
Broadway is the exception, and it covers GTK apps only.
- *Consequence*: the narrowing is for Linux app windows only. A web app
  that streams pixels is still off-soul.
- *Consequence*: Spotify is built on Chromium Embedded Framework, so it
  renders a web UI on the server and sends pictures of it. That is accepted
  for the general layer; it is not the cheap way to get Spotify.

## Our own Wayland host in Rust; TypeScript around it
_2026-10-23_ — A small Rust process built on smithay is the Wayland server
that Linux apps connect to. It does only the Wayland part: accepting windows,
reading their images, delivering clicks and keys. It talks to the NestJS
backend over a local socket. The backend keeps the sign-in, relays windows and
input over the signed-in WebSocket the way the Terminal's PTY does, and owns
the list of apps. The compositor (the desktop's window manager, in the browser)
opens one OS window per Linux app window. Rust builds in its own Docker stage,
and only the binary reaches the image.
Rejected: forking Greenfield (an in-browser Wayland compositor, AGPL,
TypeScript), whose last real commit was 2024-10, which draws every app into
one canvas acting as a single screen, and whose server half needs GStreamer,
EGL, GBM and OpenGL. Also rejected: Xpra, which runs a hidden X11 server and a
large Python stack and has its own window look; a TypeScript Wayland server
with a native addon, since Node can neither receive file descriptors over a
socket nor `mmap`, so the hard part would not be TypeScript anyway; and an
all-Rust server that also handles the browser connection, which duplicates the
sign-in checks.
**Why**: one OS window per Linux app window is the point, and none of the
off-the-shelf options gives that without patching it. smithay already covers
the wire protocol, descriptor passing, shared memory, xdg-shell, the keyboard
and XWayland. The split mirrors the Terminal: a native piece for the system
part, the backend for auth and transport.
- *Consequence*: Rust joins a TypeScript repo, with its own build stage.
- *Consequence*: "compositor" keeps its glossary meaning (the browser window
  manager). The Rust process is the *Wayland host*, never "the compositor".

## Alpine stays; Linux apps come from Nix, installed at runtime
_2026-10-23_ — The OS stays on Alpine (musl). Linux apps are Nix packages,
each carrying its own glibc and libraries in `/nix/store`, so musl never
matters to them. Nix runs single-user: `/nix` belongs to `imbatranim` and sits
on its own volume, so the user installs Linux apps without sudo and they
survive image rebuilds. Spotify comes from nixpkgs as an unfree package.
Rejected: moving the OS to Debian (the owner's first pick, changed the same
day once Nix was on the table), which is the simplest and best-trodden path
but drops Alpine and fixes apps at build time; an opt-in Debian companion
container, which is two machines acting as one; Alpine packages only, which
has no Spotify; gcompat, too thin for a Chromium-based app; a hand-kept glibc
folder with patched binaries; and a lighter glibc base such as Wolfi or Void,
which saves tens of MB when a Linux app's libraries weigh hundreds either way.
**Why**: the machine stays one real machine (the Terminal can start Spotify
and System Monitor sees it), Alpine stays, and a Linux app becomes something
the user installs rather than something baked into the image.
- *Consequence*: reverses the pivot era's app-install stance that the Linux
  side is fixed at image build time with no runtime package manager
  ([decisions-pivot-era.md](decisions-pivot-era.md)), for Linux apps only.
  The marketplace's 2026-10-06 narrowing covered web apps; this one covers
  Linux apps.
- *Consequence*: Linux apps are prebuilt binaries from the Nix cache, not
  built on the machine. "Build-from-source distribution" still holds for the
  OS itself (clone and `docker build`, no published image). Spotify has no
  source to build anyway.
- *Consequence*: Nix's build sandbox needs user namespaces that an
  unprivileged container doesn't get, so Nix runs with the sandbox off and
  installs from the cache rather than building.
- *Consequence*: the base image gains Nix but not the apps, which live on the
  `/nix` volume, so the slim-image target still applies to the image.
- *Note (later 2026-10-23)*: Spotify was dropped and Firefox, which Alpine
  also packages, became the first app. Nix stays: it is how the user installs
  apps without sudo, and most closed Linux apps ship for glibc only.
- *Risk*: a Nix app on a host that isn't NixOS misses what NixOS provides:
  graphics drivers, fonts, the locale archive, a correct `XDG_RUNTIME_DIR`, a
  session bus. The Wayland host takes software-drawn windows, which lowers the
  driver part. The first brief proves Firefox runs under Nix in the container
  before any host work depends on it.

## A Linux app lives with its tab, and sleeps under the cover screen
_2026-10-23_ — A Linux app belongs to the tab that started it. A reload
reconnects to an app started from Start within a short grace period (about
30 s); closing the tab ends it. An app started from a Terminal follows Unix
hang-up rules: it ends with its shell, which a reload ends, unless it was
started with `setsid`, `nohup` or `disown`. While the tab is open, the app is frozen (SIGSTOP) when the cover
screen comes up, by idle timeout or by hand, and resumed when the desktop is
uncovered. A Linux app that is still drawing holds the idle cover off, the way
a playing video does. Separately, a hidden tab or a minimized window gets no
images and no redraw requests.
Rejected: apps that keep running on the machine with reattach from any tab
(revisits the no-reattach session rule, needs two-tab rules, and leaves
forgotten apps holding the VPS's RAM); freezing instead of quitting when the
tab closes; and ending apps whenever the socket drops, as Terminal shells do,
which kills them on every reload.
**Why**: it keeps the session rule in [os-layering.md](os-layering.md) (closing
the tab is logging out, reloading is the screen redrawing), and on a small VPS
an idle app should cost no CPU. Reusing brief 97's idle cover avoids a second
timer and a second setting.
- *Consequence*: the Linux apps feature is on on every machine, VPS included;
  the cost of an idle app is its RAM, which the VPS's swap can take.
- *Consequence*: a frozen app's network connections can drop while it sleeps,
  so it may need to reconnect when woken.
- *Consequence*: each desktop session gets its own Wayland socket, and that
  tab's Terminal shells carry it in `WAYLAND_DISPLAY`. An app started from the
  Terminal therefore belongs to the tab whose shell started it and ends with
  it, like one started from Start.
- *Consequence*: an app is many processes (Firefox is), so it is launched in
  its own process group and frozen as a group. A frozen client misses the
  host's liveness pings, so the host does not count those against it.
