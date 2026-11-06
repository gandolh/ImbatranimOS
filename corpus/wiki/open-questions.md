---
summary: Open (2026-11-06): the imbatranim-apps backlog, fifteen todos (thirteen here, two in imbatranim-office) whose open questions are grilled when each starts, listed here by todo; the call that spans four of them is whether the blocked apps' backend modules stay in the OS. Below it, the resolved questions: the OS's own apps as streamed Linux apps (no, with Open with for Linux apps as brief 46), and the web-OS era ones (install story, HTTPS, image size, the repl module).
updated: 2026-11-06
---

# Open questions

## Open

**The imbatranim-apps backlog** (2026-11-06). The owner approved the plan
([research-imbatranim-apps.md](research-imbatranim-apps.md)) and asked for
its open questions to be written and grilled when each piece of work
starts, the work kept in the backlog. Each todo lists its questions first,
each with a proposed answer:

- [imbatranim-office-becomes-imbatranim-apps](../todos/imbatranim-office-becomes-imbatranim-apps.md): the descriptor id, the board project, the licence.
- [games-install-from-imbatranim-apps](../todos/games-install-from-imbatranim-apps.md): the descriptor, the group layout (one workspace or self-contained), kept ids, the icons.
- [notepad-takes-over-markdown-editors-job](../todos/notepad-takes-over-markdown-editors-job.md): which of Markdown Editor's pieces Notepad takes, the id move.
- [kit-apps-may-run-webassembly](../todos/kit-apps-may-run-webassembly.md): the npm-only rule as policy, threads off.
- [catalog-apps-bring-background-widgets-layers-and-commands](../todos/catalog-apps-bring-background-widgets-layers-and-commands.md): declared hooks, named exports, containment, the kit version, the sign-in cost.
- [start-shows-a-folder-per-group](../todos/start-shows-a-folder-per-group.md): what makes a folder, in place or cascade, search, a folder for the base.
- [calculator-paint-and-snipping-tool-install-as-accessories](../todos/calculator-paint-and-snipping-tool-install-as-accessories.md): the descriptor, Snipping Tool without Paint.
- [image-viewer-and-media-player-join-accessories](../todos/image-viewer-and-media-player-join-accessories.md): Files' previews, an Install button in the chooser.
- [code-editor-and-diff-install-as-developer](../todos/code-editor-and-diff-install-as-developer.md): the text fallback, Compare without Diff, the descriptor, what if Monaco can't build under the cap.
- [clock-and-calendar-join-accessories](../todos/clock-and-calendar-join-accessories.md): **the modules stay in the OS**, widgets after an uninstall, alarms while uninstalled.
- [todo-sticky-notes-and-bookmarks-join-accessories](../todos/todo-sticky-notes-and-bookmarks-join-accessories.md): **the modules stay in the OS**, sticky notes after an uninstall.
- [git-gui-and-rest-api-client-join-developer](../todos/git-gui-and-rest-api-client-join-developer.md): **the modules stay in the OS**.
- [archive-manager-joins-accessories](../todos/archive-manager-joins-accessories.md): **the module stays in the OS**, Files' menus without it, or keep it in the base.

In imbatranim-office: `cad-reads-dwg-in-the-tab` (a worker per file, the
server going, the WASM invariant) and `pdf-decodes-jpeg2000-and-jbig2-images`
(what ships, the fallbacks). The one call that touches four todos is the
backend modules staying in the OS (Claude's default; the alternatives are
in each).

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
