---
summary: One open question (2026-11-06) — confirm that the OS's own apps and the office suite stay kit apps rather than becoming streamed Linux apps (research-native-apps-via-wayland.md), and whether Open with for a Linux app is wanted; below it, the resolved web-OS era questions (install story, HTTPS, image size, accent, registry, shared origin) with where each answer lives.
updated: 2026-11-06
---

# Open questions

## Open

**The OS's own apps as Linux apps?** (asked 2026-11-06, researched the same
day in [research-native-apps-via-wayland.md](research-native-apps-via-wayland.md)).
The research recommends **no**. Files, Settings, Terminal, Notes, the other
add-ons, the office suite and the marketplace apps stay in the tab, and
native programs such as LibreOffice or QCAD stay optional installs from
Settings → Linux apps. Reasons: the 1 GiB cap holds one Firefox, the Android
phone's on-screen keyboard can't type into a Linux window, and the calls locked on 2026-10-21
(office) and 2026-10-23 (Linux apps) stand against it. Measured the same day
([research-native-apps-via-wayland-measured.md](research-native-apps-via-wayland-measured.md)):
every key waits a round trip (120-245 ms on an emulated phone link, against
about 10 ms in a kit field), the keyboard gap is confirmed in emulation and is
now a todo, and the cap matters for big programs only (Firefox 547 MiB,
Writer 306 MiB, xterm 20 MiB). The no stands, narrowed. The owner confirms or
overrules. A yes would revisit those calls with a `log.md` entry. Also for
the owner: should installed Linux apps become Open with handlers (Files
handing an `.odt` to LibreOffice)? That is the one build the research found
worth doing, and it gets a brief only if asked for.

## Resolved

_Nothing else is open._ The last three were answered on 2026-10-06: the crimson
accent stands (already recorded in decisions.md), build-from-source is final,
and the shared origin is accepted while the desktop drops Ward
([decisions-estate-era.md](decisions-estate-era.md),
the move off Ward (2026-10-07), built 2026-10-07).

Resolved 2026-07-16: fork prune was clean — docker-desktop and
service-launcher were not entangled with shared window/file services;
removing them + the docker/services backend modules + dockerode left both
apps building green.

Resolved 2026-07-16 + user revisit): image size — keep NestJS,
retire the 150 MB target as unrealistic, new bar is ≤~400 MB image +
cold-start/RAM as the real "lightweight" measure. See decisions.md.

Resolved 2026-07-17: HTTPS — reverse-proxy TLS (Caddy recipe in
infrastructure/README.md), not built-in. See decisions.md.

Resolved 2026-07-17: the config-based `repl` module does NOT
survive — deleted, absorbed by the real WS terminal. See decisions.md.

Resolved 2026-07-17: files-vs-file-manager/notes reconciled by
extending the existing `files` module with a `home` root; notes module
untouched, rides the hardened service.

Resolved 2026-07-17: app-install story — v1 = web-app modules
only, Linux side fixed at image build. See decisions.md.
