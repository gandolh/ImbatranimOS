---
summary: Research (2026-11-06) on the owner's plan to rename imbatranim-office to imbatranim-apps and make it the home of every app that can be installed, so a fresh OS starts cleaner; then grilled the same day. Measured, the image barely shrinks (all 25 built-in apps are 16.8 MB of a 324 MB image, 13.9 MB of it Monaco), and the owner accepted that. Has a table of every app with its size, backend module and what moving it takes. After the grill, 16 apps stay built in for a normal user (browsing, media, small coding); Minesweeper and Solitaire, Git GUI, the REST API Client, Todo and Bookmarks become installable beside Office; Markdown Editor folds into Notepad and Archive Manager into Files. The work is eleven backlog todos here and one in imbatranim-office (§7); the kinds of app, groups and the moving checklist are in research-imbatranim-apps-layout.md.
updated: 2026-11-06
---

# Research: the apps that leave the image (2026-11-06)

The owner asked on 2026-11-06 to rename imbatranim-office to imbatranim-apps,
make it "a repo for the apps that can be installed to imbatranim", list the
apps we made that should move there as opt-in installs "so that the image
comes smaller and cleaner at first install", allow three kinds of app (client
only, a WASM module, and suites like Office), and check whether older apps
such as the PDF viewer should go. Research only; nothing was built.

**Outcome after the grill (2026-11-06).** §6 has the decisions. The proposal
below was the starting point, and the table's last column shows where each
app ended.

**Short answer, as first proposed.** The image barely shrinks: moving every app that can go
saves about 14.5 MB of 324, and 13.9 MB of that is Monaco. The 2026-07-16 bar is
already "≤ ~400 MB, with cold start and RAM as the real measure"
([open-questions.md](open-questions.md)), and the add-ons are lazy chunks
that cost neither until opened. What the move does buy: a Start menu with
seven apps instead of 25, about 29,000 source and 8,000 test lines out of the
OS repo, and apps released without an OS deploy. Nine apps can move with no
change to the kit contract, one folds into Notepad, and eight can't move yet. The work waits in the backlog as todos (§7).

## 1. What the image holds

`imbatranimos:1.0`, built 2026-11-05, measured with `docker history`:

| Layer | Size |
|---|---|
| Alpine + Node 24 base | 166 MB |
| Nix in the image (Linux apps) | 56 MB |
| Root `node_modules` (backend runtime) | 47.5 MB |
| `apk add` (git, dbus, libxkbcommon, tini) | 18.7 MB |
| **The desktop build (`public/`), every app included** | **16.8 MB** |
| Backend `node_modules` and `dist` | 10.4 MB |
| Wayland host | 2.2 MB |
| Total | 324 MB |

Of the desktop's 16.7 MB (the 2026-11-03 build), Monaco's workers and
languages are 13.9 MB, the Terminal's xterm 0.4 MB, Markdown Editor 0.2 MB,
and every other app 6-91 kB. The frontend libraries never reach the image
apart from what Vite bundles. The backend modules behind the apps are small
too; the one heavy runtime dependency is the Browser's proxy
(`@mercuryworkshop/*`, 6.5 MB).

## 2. Every app, and what moving it takes

Lines are source / tests. "Can't carry" is what an `AddonManifest` has and a
catalog app (`suiteAppSchema` in `apps/backend/src/modules/marketplace/catalog.ts`)
doesn't: `background`, `widgets`, `commandSources`, `service`.

| App | Lines | Chunk | Own backend module | Blocker | Proposal |
|---|---|---|---|---|---|
| Settings | core | 48 kB | prefs, auth… | is the OS | **Base** |
| Files | 5,199 / 982 | 91 kB | files (3,180) | the OS's file surface | **Base** |
| Terminal | 1,132 / 295 | 402 kB | pty (1,358) | the real PTY | **Base** |
| Notepad | 1,338 / 427 | 16 kB | — | opens `.txt`, `.log`; dotfiles | **Base**, takes Markdown Editor's job |
| System Monitor | 933 / 120 | 11 kB | system (1,101) | `widgets`, `service`, `/proc` | **Base** |
| Logs | 418 / 87 | 7 kB | logs (1,141) | shows sign-in attempts | **Base** |
| Browser | 388 / 68 | 6 kB | browser (1,185) | the machine's own proxy | **Base** |
| Minesweeper, Solitaire | 1,131 / 319 | 16 kB | — | none | **Wave 1**, Games (first) |
| Calculator | 2,594 / 712 | 35 kB | — | none | **Wave 1**, Accessories |
| Paint | 914 / 118 | 15 kB | — | none | **Wave 1**, Accessories |
| Snipping Tool | 1,396 / 161 | 21 kB | — | none (hands off to Paint) | **Wave 1**, Accessories |
| Image Viewer | 910 / 172 | 12 kB | — | the opener for images | **Wave 1**, Accessories |
| Media Player | 2,050 / 453 | 27 kB | — | the opener for audio and video | **Wave 1**, Accessories |
| Code Editor + Diff | 2,060 / 485 | 21 kB + 13.9 MB | — | opener for code files and the `.csv` fallback; Monaco's build under the 1 GiB cap is unmeasured | **Wave 1**, Developer |
| Markdown Editor | 2,629 / 1,091 | 199 kB | — | Notepad's description is "Markdown text editor" and it renders a preview with the same `react-markdown` | **Drop**, its extras go to Notepad |
| Clock | 2,132 / 609 | 20 kB | clock (544) | `background`, `widgets`, its data | Wave 2 |
| Calendar | 3,266 / 1,184 | 36 kB | calendar (532) | `background`, `widgets`, its data | Wave 2 |
| Todo | 1,641 / 296 | 18 kB | todos (584) | `background`, its data | Wave 2 |
| Sticky Notes | 1,103 / 137 | 8 kB | sticky-notes (326) | its data | Wave 2 |
| Bookmarks | 1,726 / 566 | 17 kB | bookmarks (888) | `commandSources`, its data, reads the Browser's config | Wave 2, or into the Browser |
| Git GUI | 1,947 / 326 | 28 kB | git (2,768) | the OS runs git for it | Wave 3, Developer |
| REST API Client | 2,946 / 1,115 | 39 kB | http-proxy (783) | the SSRF-guarded proxy | Wave 3, Developer |
| Archive Manager | 923 / 52 | 13 kB | archive (2,164) | opener for zip and tar; unpacks in home | Wave 3, or base |

**Wave 1** needs only `fs`, `intents`, `notify` and `window`, which a kit app
already has. **Wave 2** needs the contract to grow and an answer for where
each app's data lives, which is in the OS's database today:
1. an OS-side store each app reaches through `system` (one small module
   instead of five);
2. a server per group, which costs about 100 MB idle, one of four server
   slots and a 2.7-5 s cold start on a 1 GiB box (Office's, measured
   2026-10-28);
3. files in the home folder, which need a migration.

**Wave 3** apps lean on modules that do system work (git, an outbound proxy,
unpacking). Either those modules stay in the OS as capabilities, or the apps
stay built in.

Games are pure client, but their own index calls them "the identity-affirming
tier: the two games a Win7-shaped desktop cannot not have". Moving them
reverses that comment, which the owner's ask covers.

## 3. Kinds of app, install groups and the rename

In [research-imbatranim-apps-layout.md](research-imbatranim-apps-layout.md):
the three kinds of app (client only, a WASM engine from npm under a kit UI,
kit apps with a server) are runtime needs, not install units; the groups
(Office, Accessories, Games, Developer) are one descriptor and one Start
folder each; the layout is unproven, because the office build is anchored at
the repo root; and the rename keeps the descriptor id `imbatranim-office`.

## 4. Drop or merge

- **PDF Viewer: already done.** PDF Viewer and norPDF were merged into
  Office's PDF on 2026-10-21 and the built-ins removed on 2026-10-28, which
  shrank the image by 2.7 MB (log.md). The crafts (PdfCraft and the others)
  are Rust, alpha and a reference only, by the office repo's locked decision.
  Office's PDF is the rewrite.
- **Markdown Editor into Notepad.** This is the clearest overlap: Notepad
  already calls itself a markdown editor with a live preview. Notepad takes
  `.md` and whatever Markdown Editor does that it lacks (code highlighting
  in the preview through `rehype-highlight`, to check). This retires 199 kB
  and 3,700 lines from the OS, some of which move into Notepad.
- **Bookmarks into the Browser: a question.** It reads `/browser/config` and
  feeds the command palette, but it is also a link organiser of its own.
- **The Browser and Firefox: keep both.** The built-in costs 6 kB plus its
  proxy and works on the phone; Firefox costs 506-593 MB.
- **A leftover.** `apps/backend/src/modules/notes/` holds only
  `dto/upsert-recent.dto.ts`, which nothing imports. Its module was deleted in
  August (old brief 94).

## 5. Costs of moving an app out

- **A fresh OS opens less.** Without Accessories, a `.png` or `.mp3` gets
  the Marketplace sentence `marketplaceOpeners.ts` already gives `.docx`.
  Without Developer, `.json` and `.csv` fall to Notepad.
- **Installs build on the box.** Each one runs `npm ci` and Vite in the live
  container, under the 1 GiB cap. Hollow's took 18 s plus under a second
  (2026-10-07); Office's leaves about 853 MB of `node_modules` on the home
  volume (measured on the local checkout's install).
  Monaco's build under the cap is unmeasured.
- **Backups leave builds out.** After a restore, every group shows "build
  missing" until reinstalled.
- **Kept ids keep the owner's choices.** As with Office (2026-10-28), pins,
  startup entries and Open-with choices stay in the dotfiles and come back
  when the app is installed. A kept id needs no `RETIRED_APP_IDS` pair.
- **The cheap alternative is no move at all:** ship the same built-ins switched
  off, with only the base enabled. Start gets just as short, but the image
  and the OS repo stay as they are.

## 6. Owner decisions

The owner approved the plan on 2026-11-06 ("looks good, write the briefs")
and was grilled the same day. The durable calls are in
[decisions-marketplace-suites.md](decisions-marketplace-suites.md) and
[decisions-themes.md](decisions-themes.md):
- **The base serves a normal user**: browsing, media, small coding. Sixteen
  apps stay built in, and Code Editor, Image Viewer, Media Player,
  Calculator, Clock, Calendar, Paint, Snipping Tool and Sticky Notes joined
  the first seven.
- **The OS keeps the minimum; apps add on top.** `archive`, `git` and
  `http-proxy` stay as OS services. Files opens archives like folders, so
  Archive Manager goes, and Markdown Editor folds into Notepad.
- **Installable apps keep their data** as real files in
  `~/.local/share/imbatranim/<app-id>/`. It is kept on uninstall unless the
  owner ticks "Also remove its data", and alarms stop with their app.
- **Groups are the install unit:** Office, Games, Developer and Accessories
  (Todo and Bookmarks). Start gets search, pins and an A-Z list, with no
  folders.
- **WASM engines from npm may run in the tab.** PDF's image decoders come
  first, and CAD's DWG stays on the server.

The calls left are engineering ones, proposed in each todo.

## 7. The backlog

Each todo lists its open questions first and its draft brief after;
promoting one after its grill makes a numbered brief. Briefs 50-62 were the
first drafts, now in `briefs/superseded/`. Dropped in the grill: the todos
that moved Calculator, Paint and Snipping Tool, Image Viewer and Media
Player, Code Editor and Diff, and Clock and Calendar.

| Todo | What |
|---|---|
| [imbatranim-office-becomes-imbatranim-apps](../todos/imbatranim-office-becomes-imbatranim-apps.md) | The rename (first) |
| [games-install-from-imbatranim-apps](../todos/games-install-from-imbatranim-apps.md) | Games; settles the group layout (second) |
| [notepad-takes-over-markdown-editors-job](../todos/notepad-takes-over-markdown-editors-job.md) | Notepad takes over Markdown Editor |
| [files-handles-archives-and-archive-manager-goes](../todos/files-handles-archives-and-archive-manager-goes.md) | Files opens archives like folders; Archive Manager goes |
| [kit-apps-may-run-webassembly](../todos/kit-apps-may-run-webassembly.md) | The desktop allows WASM |
| [apps-get-a-data-folder-of-their-own](../todos/apps-get-a-data-folder-of-their-own.md) | A data folder per app (`system.data`) |
| [catalog-apps-bring-background-services-and-commands](../todos/catalog-apps-bring-background-services-and-commands.md) | Catalog apps bring background services and palette sources |
| [start-gets-search-pins-and-an-a-to-z-list](../todos/start-gets-search-pins-and-an-a-to-z-list.md) | Start: search, pins, A-Z list |
| [the-chooser-links-to-the-marketplace](../todos/the-chooser-links-to-the-marketplace.md) | The chooser links to the Marketplace |
| [todo-and-bookmarks-install-as-accessories](../todos/todo-and-bookmarks-install-as-accessories.md) | Todo and Bookmarks as Accessories (after Games, hooks, data folder) |
| [git-gui-and-rest-api-client-join-developer](../todos/git-gui-and-rest-api-client-join-developer.md) | Git GUI and REST API Client as Developer (after Games, data folder) |

In imbatranim-office, after the WASM todo:
`pdf-decodes-jpeg2000-and-jbig2-images`. `cad-reads-dwg-in-the-tab` was
dropped.
