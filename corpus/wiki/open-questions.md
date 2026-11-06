---
summary: The imbatranim-apps backlog (2026-11-06): fourteen todos here and one in imbatranim-office, grilled the same day and checked against Unix and Windows practice, every question answered and ready to promote. Below it, the resolved questions: the OS's own apps as streamed Linux apps (no, with Open with for Linux apps as brief 46), and the web-OS era ones (install story, HTTPS, image size, the repl module).
updated: 2026-11-06
---

# Open questions

## Open

**The imbatranim-apps backlog** (2026-11-06). Grilled with the owner the
same day, product and engineering calls both, and checked against Unix and
Windows practice
([research-unix-and-windows-conventions.md](research-unix-and-windows-conventions.md),
[decisions-app-identity-and-trust.md](decisions-app-identity-and-trust.md)).
Every question in these todos is answered; they are ready to promote to
briefs:

- [imbatranim-office-becomes-imbatranim-apps](../todos/imbatranim-office-becomes-imbatranim-apps.md)
- [games-install-from-imbatranim-apps](../todos/games-install-from-imbatranim-apps.md)
- [notepad-takes-over-markdown-editors-job](../todos/notepad-takes-over-markdown-editors-job.md)
- [files-handles-archives-and-archive-manager-goes](../todos/files-handles-archives-and-archive-manager-goes.md)
- [kit-apps-may-run-webassembly](../todos/kit-apps-may-run-webassembly.md)
- [apps-run-as-their-own-identity](../todos/apps-run-as-their-own-identity.md)
- [apps-get-a-data-folder-of-their-own](../todos/apps-get-a-data-folder-of-their-own.md)
- [installable-apps-get-files-by-grant](../todos/installable-apps-get-files-by-grant.md)
- [catalog-apps-bring-background-services-and-commands](../todos/catalog-apps-bring-background-services-and-commands.md)
- [start-gets-search-pins-and-an-a-to-z-list](../todos/start-gets-search-pins-and-an-a-to-z-list.md)
- [the-chooser-links-to-the-marketplace](../todos/the-chooser-links-to-the-marketplace.md)
- [url-apps-install-natively-once-trusted](../todos/url-apps-install-natively-once-trusted.md)
- [todo-and-bookmarks-install-as-accessories](../todos/todo-and-bookmarks-install-as-accessories.md)
- [git-gui-and-rest-api-client-join-developer](../todos/git-gui-and-rest-api-client-join-developer.md)

In imbatranim-office: `pdf-decodes-jpeg2000-and-jbig2-images`, also
answered.

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
