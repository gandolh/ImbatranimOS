---
summary: Dated status (2026-11-09) of the imbatranim-apps plan, briefs 63-76 - which are built and where (63 rename, 64 Games, 65 Notepad, 66 Files archives, 67 WebAssembly, 68 app identity, 72 Start, 73 chooser link, 74 native URL apps, 75 Accessories with the one-time data move, 76 Developer with Git GUI's recents as folder recents), what the owner still owes, and what is open. Plan and brief table in research-imbatranim-apps.md.
updated: 2026-11-09
---

# Status: the imbatranim-apps plan

Grilled and promoted on 2026-11-06; the plan and the brief table are in
[research-imbatranim-apps.md](research-imbatranim-apps.md#7-the-briefs), the
calls in [decisions-app-identity-and-trust.md](decisions-app-identity-and-trust.md).
Each outcome is in `briefs/done/`.

- **63** (done): the repo is renamed. Owner: the GitHub rename, then
  `source.repo` here and the template URL in the Apps repo.
- **67** (`932d92e`, 1.192.0, ready for deploy): WebAssembly on, with
  COOP/COEP on the desktop and `require-corp` on every frame; URL apps get
  WASM without threads. Owner: phone checks on Android and iPhone.
- **68** (`2522407`, 1.196.0, ready for deploy): apps run as their own
  identity (token header, per-file owner and mode). The owner chose a
  stricter default for built-in apps on 2026-11-06; brief 70 flipped it on
  2026-11-09 (`8b10be0`, 1.228.0) with the grant flows.
- **70** (done 2026-11-09, ready for deploy): every app reaches only the
  files given to its window; walked in the dev container (15, then 5).
- **69** (done 2026-11-09, ready for deploy): data folders of their own;
  walked only in passing, in brief 70's walk.
- **72** (`d6ae13d`, fix `baf3f5e`, ready for deploy): Start has search, pins
  and an A-Z list; the fix after walk 1 covers ranking, duplicates and panel
  height.
- **73** (`2f5a039`, ready for deploy): Open With links to the Marketplace
  row.
- **64** (imbatranim-apps `647580f`, OS `6a6a8d9`, ready for deploy): Games
  install from imbatranim-apps; the layout is one root workspace
  ([recipe](imbatranim-apps-group-recipe.md)). Walk 2a: 8.5 s, 125 MB.
- **65** (`e8016ed`, fix `f743f0c`, 1.198.0, ready for deploy): Notepad opens
  `.md` in a split view; Markdown Editor is gone.
- **66** (`712538b`, ready for deploy): Files opens archives like folders;
  Archive Manager is gone. Gaps: a lone `.gz`, `.xz` or `.bz2`; an empty folder
  after a refused zip-slip.
- **Office pin** (`a80c295`, 1.202.0): imbatranim-apps `8a42180`, with the PDF
  decoders; walk 2a rendered JPEG2000 and JBIG2.
- Owner: push imbatranim-apps first, then this repo, then deploy.
- Walk 1 passed 11 of 11 on 2026-11-06 (identity, isolation headers, Start,
  chooser link). Walk 2 (Games install, Office PDFs, the WASM fixture; then
  65 and 66) passed.
- **74** (imbatranim-apps `e3b01e0`, OS `6ccf623`, `5b9c005`, `029fa13`,
  1.234.0, ready for deploy, 2026-11-09): apps from a URL with a version 2
  `imbatranim.json` build from source and run natively; verified ones (the
  pinned copy of `verified.json`, empty for now) install at once, the rest
  only with the owner's trust at that commit. Owner: push imbatranim-apps
  first, fill `verified.json` (board question). The walk is owed.
- **75** (imbatranim-apps `1a04603`, `ebc2be6`; OS `98e41ff`, `30a97f6`,
  1.244.0, ready for deploy, 2026-11-09): Todo and Bookmarks install as
  Accessories; their rows move once into JSON files in their data folders
  at the first start, then the tables and both modules are gone. Owner:
  push imbatranim-apps first, then deploy, check Logs for the move; a board
  question on running the move after a restore. The walk is owed.
- **76** (imbatranim-apps `8a1e811`, `4ef5f5a`; OS `8231ee8`, 1.254.0,
  ready for deploy, 2026-11-09): Git GUI and the REST API Client install as
  Developer. Git GUI's recent repositories move once into `recents.json` in
  its state folder and into the OS recents as folders (owner, 2026-11-09:
  the OS recents decide what reopens), then the `git` module's recents
  routes and table are gone. Owner: push imbatranim-apps first, then
  deploy, check Logs for the move. The walk is owed.
- Open: 69, 70, 71 are not covered here; see their briefs and the log.
