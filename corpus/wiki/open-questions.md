---
summary: Web-OS era unknowns — app-install story without sudo, HTTPS in-app vs proxy, accent pick, image size reality, registry publishing, fork prune surprises.
updated: 2026-07-16
---

# Open questions

- **Accent color on the B&W identity — final pick is the user's.** Brief
  14 shipped 4 live presets in Settings (crimson, cobalt, emerald,
  signal-orange) with crimson `#c0263a` as the provisional default
  (recommended for contrast + distinctiveness). Pick from the live desktop
  and record the choice in decisions.md.
- **Registry publishing** (Docker Hub/GHCR) vs build-from-source-only —
  deferred until v1 works; build-from-source is the standing decision.

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
