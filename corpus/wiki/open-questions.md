---
summary: Open (2026-11-06): the imbatranim-apps backlog, eleven todos here and one in imbatranim-office. The product calls were grilled the same day; what remains per todo are engineering calls with proposed answers, confirmed when each starts. Below it, the resolved questions: the OS's own apps as streamed Linux apps (no, with Open with for Linux apps as brief 46), and the web-OS era ones (install story, HTTPS, image size, the repl module).
updated: 2026-11-06
---

# Open questions

## Open

**The imbatranim-apps backlog** (2026-11-06). The owner approved the plan
([research-imbatranim-apps.md](research-imbatranim-apps.md)) and was grilled
the same day on every product call; those answers are in the todos and in
[decisions-marketplace-suites.md](decisions-marketplace-suites.md). What is
left is engineering calls, each with a proposed answer, to confirm when the
todo starts:

- [imbatranim-office-becomes-imbatranim-apps](../todos/imbatranim-office-becomes-imbatranim-apps.md): the descriptor id, the board project, the licence.
- [games-install-from-imbatranim-apps](../todos/games-install-from-imbatranim-apps.md): the descriptor, the group layout, kept ids, the icons.
- [notepad-takes-over-markdown-editors-job](../todos/notepad-takes-over-markdown-editors-job.md): the id move (what comes across is settled: all five).
- [files-handles-archives-and-archive-manager-goes](../todos/files-handles-archives-and-archive-manager-goes.md): formats that open as folders, where Extract puts things, the id move.
- [kit-apps-may-run-webassembly](../todos/kit-apps-may-run-webassembly.md): the npm-only rule as policy, threads off.
- [apps-get-a-data-folder-of-their-own](../todos/apps-get-a-data-folder-of-their-own.md): the call's shape, always present or listed, URL apps.
- [catalog-apps-bring-background-services-and-commands](../todos/catalog-apps-bring-background-services-and-commands.md): declared hooks, named exports, containment, the kit version.
- [start-gets-search-pins-and-an-a-to-z-list](../todos/start-gets-search-pins-and-an-a-to-z-list.md): default pins, what search finds, focus on open, the Linux tag.
- [the-chooser-links-to-the-marketplace](../todos/the-chooser-links-to-the-marketplace.md): where the link lands.
- [todo-and-bookmarks-install-as-accessories](../todos/todo-and-bookmarks-install-as-accessories.md): file format, when the data moves.
- [git-gui-and-rest-api-client-join-developer](../todos/git-gui-and-rest-api-client-join-developer.md): (module question answered; the rest follows the checklist).

In imbatranim-office: `pdf-decodes-jpeg2000-and-jbig2-images` (what ships,
the fallbacks).

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
