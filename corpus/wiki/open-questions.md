---
summary: Nothing open as of 2026-10-06; the resolved web-OS era questions (install story, HTTPS, image size, accent, registry, shared origin) with where each answer lives.
updated: 2026-10-06
---

# Open questions

_Nothing is open._ The last three were answered on 2026-10-06: the crimson
accent stands (already recorded in decisions.md), build-from-source is final,
and the shared origin is accepted while the desktop drops Ward
([decisions-estate-era.md](decisions-estate-era.md),
[brief 157](../briefs/todo/157-drop-ward-own-sign-in.md)).

Resolved 2026-07-16 (brief 08): fork prune was clean — docker-desktop and
service-launcher were not entangled with shared window/file services;
removing them + the docker/services backend modules + dockerode left both
apps building green.

Resolved 2026-07-16 (brief 09 + user revisit): image size — keep NestJS,
retire the 150 MB target as unrealistic, new bar is ≤~400 MB image +
cold-start/RAM as the real "lightweight" measure. See decisions.md.

Resolved 2026-07-17 (brief 10): HTTPS — reverse-proxy TLS (Caddy recipe in
infrastructure/README.md), not built-in. See decisions.md.

Resolved 2026-07-17 (brief 11): the config-based `repl` module does NOT
survive — deleted, absorbed by the real WS terminal. See decisions.md.

Resolved 2026-07-17 (brief 12): files-vs-file-manager/notes reconciled by
extending the existing `files` module with a `home` root; notes module
untouched, rides the hardened service.

Resolved 2026-07-17 (brief 13): app-install story — v1 = web-app modules
only, Linux side fixed at image build. See decisions.md.
