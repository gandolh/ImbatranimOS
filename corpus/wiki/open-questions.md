---
summary: No open questions. The last (2026-11-06), the imbatranim-apps backlog, was grilled and promoted to briefs 63-76 here and 06 in imbatranim-office. Below it, the resolved questions: the OS's own apps as streamed Linux apps (no, with Open with for Linux apps as brief 46), and the web-OS era ones (install story, HTTPS, image size, the repl module).
updated: 2026-11-06
---

# Open questions

## Open

_Nothing is open._

## Resolved

Resolved 2026-11-06 (owner, in a grill): the imbatranim-apps backlog, every question answered and checked against Unix and Windows practice, promoted to briefs 63-76 here and 06 in imbatranim-office ([research-imbatranim-apps.md](research-imbatranim-apps.md#7-the-briefs), [decisions-app-identity-and-trust.md](decisions-app-identity-and-trust.md)).

Resolved 2026-11-06 (owner): the OS's own apps and the office suite stay
kit apps; native Linux apps only for heavy work. Recorded in
[decisions-linux-apps.md](decisions-linux-apps.md#native-only-for-heavy-work-the-oss-own-apps-stay-in-the-tab).
Installed Linux apps as Open with handlers: yes, brief 46.

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
