---
summary: One open item (2026-11-06): whether the backend modules of the apps that leave the image (Clock, Calendar, Todo, Sticky Notes, Bookmarks, Git GUI, REST API Client, Archive Manager) stay in the OS while only the apps move, Claude's default in briefs 59-62; the rest of the imbatranim-apps plan was approved the same day. Below it, the resolved questions: the OS's own apps as streamed Linux apps (no, with Open with for Linux apps as brief 46), and the web-OS era ones (install story, HTTPS, image size, the repl module).
updated: 2026-11-06
---

# Open questions

## Open

**Do the blocked apps' backend modules stay in the OS?** (2026-11-06) The
owner approved the imbatranim-apps plan's defaults ("looks good, write the
briefs"), but two calls had none: where wave 2's data lives and what happens
to wave 3's system modules. Claude's default is that the modules stay in the
OS and only the apps move
([research-imbatranim-apps.md](research-imbatranim-apps.md#6-owner-decisions)).
Briefs 59-62 build on it and ask the owner to confirm it first.

## Resolved

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
