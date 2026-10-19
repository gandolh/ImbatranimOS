# Brief 161 — The craft suite in sandboxed windows

## Context

The owner asked on 2026-10-19 to bring ArtCraft's "Crafting Apps"
([github.com/storytold](https://github.com/storytold)) into the OS. Either add them, or make
something similar. For v1, only five: **WordCraft, GridCraft, CADCraft, PdfCraft and DeckCraft**.

Facts below were checked on 2026-10-19 from read-only clones and the GitHub API. Nothing was built
or run. **These repos change daily**, so re-check versions before building.

## What the five are

- **Native Rust apps, not JS libraries.** Each is a Rust workspace with an egui 0.36 UI drawn on the
  GPU: wgpu (WebGPU, falling back to WebGL2), except PdfCraft, which uses glow (WebGL2 only).
  - The web build is the same app compiled to wasm by Trunk, drawn into one `<canvas>`.
  - There is no React, no DOM UI and nothing to import into our add-ons. Their AGENTS.md says "Rust
    only".
- **Static web build, served from any sub-path.** Each release ships a `<name>-web-<ver>.zip` static
  site. `Trunk.toml` sets `public_url = "./"`, so it works under any path.
  - Zipped sizes: Grid 7.1 MB, Deck 10.9 MB, PDF 14.5 MB, Word 15.9 MB. CAD's size was not
    measured.
- **No backend, no account, no LLM.** "Agent-native" means an outside agent can drive the desktop
  build over MCP or TCP. The web builds have neither.
- **License:** `MIT OR Apache-2.0`. The evidence is each repo's `Cargo.toml` `[workspace.package]`,
  `LICENSE-MIT` and `LICENSE-APACHE`.
  - The ArtCraft name and logos are excluded (`docs/brand/LICENSE-brand.txt`). A modified version
    must remove them.
  - Inbound to our AGPL-3.0 is fine. We would not vendor their code anyway.
- **Maturity.** Each is alpha, two to three weeks old, mostly AI-written, with about 1,000 commits
  each and releases v0.8–v0.9 (2026-10-17/18).

| Craft | What it is | Formats | Can a host page open and save its files? |
|---|---|---|---|
| WordCraft | Word clone; claims 97% of its feature catalog | docx, doc, odt, rtf, md, html → pdf | **No bridge.** Save goes to the browser's save picker or a download. Hooks exist (`Services { inbox, download, pick_open }`) |
| GridCraft | Excel clone; about 500 functions, charts, pivots | xlsx, xls, xlsb, ods, csv → pdf | **Yes**: `apps/gridcraft-web/src/host.rs` |
| CADCraft | AutoCAD 2D clone (no 3D) | dxf, dwg (desktop only) → pdf, svg, png | **Yes**: `apps/cadcraft-web/src/host.rs` |
| PdfCraft | Acrobat-style workbench; editing existing text is thin | pdf, xfdf | **Yes**: in `apps/pdfcraft-web/src/main.rs` (module `host`) |
| DeckCraft | PowerPoint clone; masters, charts, Morph, presenter view | pptx → pdf, png, gif | **No bridge.** Save always downloads. Hooks exist (`apps/deckcraft-web/src/web.rs:113-140`) |

**How the bridges work.** `?host=parent` turns a bridge on. The messages are:
- `<craft>:ready` from the app;
- `<craft>:open {name, bytes}` from the parent;
- `<craft>:save {name, bytes}` from the app, for Save, Save As and every export;
- `<craft>:dirty` and `<craft>:failed` from the app.

**All three bridges require a same-origin parent:**
- GridCraft and CADCraft compare `event.origin` with their own origin, and post to their own
  origin.
- PdfCraft reads `parent.location.origin` and switches the bridge off when that throws.

In brief 158's opaque-origin sandbox, the frame's origin is `"null"`, so none of the three can talk
to the desktop.

## What the OS already has

| Craft | Our app today | The gap |
|---|---|---|
| WordCraft | Docs (SuperDoc, 31-control toolbar, tables, styles, tracked changes) | Small. WordCraft goes deeper (references, mail merge, more formats) |
| GridCraft | Sheets (Univer + ExcelJS bridge, briefs 63/90) | Small. Charts, pivots, more formats |
| CADCraft | none | **All of it** |
| PdfCraft | PDF Viewer + norPDF (`@pdfcore/engine`) | Medium. Forms, redaction, signatures, comments |
| DeckCraft | Slides is a **viewer only** (`pptx-preview`) | **Editing** |

So v1's real value is **CAD and slide editing**. The other three give a second, deeper app for file
types we already open.

## Options

| | **A. Sandboxed frame, pinned release** (recommended) | **B. Same-origin frame** | **C. Port into our React add-ons** | **D. Build similar apps ourselves** |
|---|---|---|---|---|
| How | Serve the release's web zip on the brief-158 sandbox routes; the desktop speaks the craft bridge from the parent | Serve the zip on the desktop's origin with `allow-same-origin`; the bridges work as shipped | Wrap each wasm in our own wasm-bindgen crate on a React-owned canvas | Extend Docs, Sheets, Slides, norPDF; write a CAD app in TS |
| Patches to the crafts | All five: bridges on a `source` check instead of an `origin` check (3), and a new bridge (Word, Deck) | Word and Deck only (no bridge) | A new wrapper crate per app | None |
| Trust | The frame gets no cookie, no `/api`, no network beyond `'self'`; files only through the parent | **The frame is the owner**: it can call `/api` and open the terminal's WebSocket (`Origin` passes). An ArtCraft release we can't review would get the machine's shell | As B | Ours |
| Fits the decisions | 158's stance as built. Needs: a catalog entry may be prebuilt when sandboxed; a new "document" grant | Breaks 158's "No URL-app file without the sandbox headers" spirit and 120's "pinned commit someone chose" (a release zip is built by their CI) | Breaks "lightweight is identity" (a Rust toolchain in the build) | All hold |
| Size | 5 chunks + 5 small upstream PRs | 3 chunks + 2 PRs | Months, and the same egui UI at the end | Months per app; CAD from zero |

**Why A:** the OS is meant to be internet-exposable, with auth everywhere. B hands five
fast-moving, AI-written codebases with hundreds of contributors a live session on the owner's
machine. C gains nothing over A, because it ends with the same egui canvas and less isolation. D is
the right call for an app we want to own. It would be its own brief per app, after living with the
crafts.

## Decisions (proposed 2026-10-19; the owner confirms before chunk 1)

1. **Option A.** Each craft runs in `<iframe sandbox="allow-scripts allow-pointer-lock">` on the
   brief-158 token routes. Same CSP, no cookie, per-window token.
2. **Catalog entries, prebuilt.** The crafts go in the in-repo catalog
   (`marketplace/<id>.json`), reviewed, so they are listed and need no URL.
   - The entry has `runtime: "sandboxed"` and a pinned release asset by URL + SHA-256, not a repo
     build.
   - This is a narrow revisit of brief 120's "no prebuilt artifacts". Prebuilt is already the rule
     for sandboxed apps (158, decision 1): their code runs only in the browser sandbox, never on the
     machine.
   - The OS image stays build-from-source, and the crafts are optional installs like Hollow.
3. **A "document" grant, not `fs`.** The frame never gets `system.fs`. The parent (desktop code)
   moves the bytes:
   - It reads the file the window was opened with and posts `<craft>:open`.
   - On `<craft>:save`:
     - **Same name** as the opened file: overwrite in place, with brief 156's conflict check.
     - **Any other name** (Save As, every export): the file portal's `pickSave` with that name
       suggested, run in the parent.
     - **A new window with no file:** `pickSave`.
   - The consent card says: "can read and replace the files you open with it".
4. **Upstream first.** The bridge patches go to the craft repos as PRs from the owner's account.
   They are about 150–200 lines of Rust per app, modelled on GridCraft's `host.rs`:
   - accept a parent message by `event.source === parent`, not by origin;
   - post to `'*'`. `frame-ancestors 'self'` already limits who can frame the page.

   PdfCraft fixed the cross-origin case once (#2167) and merges outside PRs, so this is a normal
   contribution. **Fallback:** if a PR is not merged, the owner builds a fork's web zip locally
   (`trunk build --release`). A fork is a modified version, so it must drop the ArtCraft name and
   logos and get a name of ours.
5. **They sit next to our apps, not over them.**
   - Each descriptor declares `opens`, so the crafts appear in Open With (brief 81).
   - Defaults change only where we have no app: `.dxf`/`.dwg` → CADCraft. `.pptx` stays on Slides
     until the owner says so.
   - Nothing built-in is removed in v1.
6. **Icons are ours (lucide), never the ArtCraft logos.** The names stay WordCraft, GridCraft and so
   on only for unmodified upstream builds.

## Contracts

### A. Catalog descriptor (additions to brief 120's schema)

```json
{
  "schemaVersion": 2,
  "id": "gridcraft",
  "name": "GridCraft",
  "description": "Spreadsheets with Excel's functions, charts and pivots (ArtCraft, MIT/Apache-2.0).",
  "meta": ["office"],
  "runtime": "sandboxed",
  "type": "static",
  "frame": "page",
  "release": {
    "url": "https://github.com/storytold/gridcraft/releases/download/v0.8.0/gridcraft-web-0.8.0.zip",
    "sha256": "<64 hex>",
    "page": "index.html"
  },
  "bridge": { "protocol": "gridcraft", "query": "host=parent" },
  "opens": ["xlsx", "xls", "xlsb", "ods", "csv", "tsv"],
  "window": { "defaultSize": { "w": 1200, "h": 760 }, "minSize": { "w": 720, "h": 480 } },
  "capabilities": ["document"],
  "icon": "sheet",
  "minSystemVersion": 2
}
```

- `frame: "page"` is new. The served file is the craft's own `index.html`, not 158's shell,
  because the craft is a full page rather than a `mount` module. It is a separate field because
  `type` already means `static | service` (whether a server runs). A page app is `static`.
- `release.url` must be on `github.com/<owner>/<repo>/releases/download/`. The download is
  refused unless its SHA-256 matches.
- `bridge.protocol` is the message prefix.
- The other fields mean what they mean today.

### B. Install and serve

- Download with a 60 s limit and a 64 MB cap, check the hash, and unzip into
  `apps/<id>@<buildId>`.
- Refuse `..`, absolute paths, symlinks and anything over 256 MB unpacked. Dotfiles are not
  served.
- Serve under `marketplace/sandbox/<token>/` with 158's headers. Trunk's `index.html` carries an
  inline module script; compute its `sha256-…` at install and add it to `script-src` for that app
  only. Never add `'unsafe-inline'` for scripts.
- **Inject a page runtime.** A page app skips 158's `runtime.js`, so it would lose what that file
  does. At install, the backend inserts
  `<script src="page-runtime.js"></script>` as the first child of `<head>`. It is a classic script,
  so it runs before Trunk's deferred module. `page-runtime.js` is a cut-down copy of 158's runtime,
  without `mount` or the `system` handle. It carries:
  - the refusal to run unless `self.origin === 'null'` and the page is framed;
  - the in-memory `localStorage` and `sessionStorage`, because eframe's persistence would
    otherwise hit the throwing real ones (PdfCraft's `pdfcraft` key, WordCraft's preferences);
  - the inert `document.cookie`, and WebRTC removed;
  - the `Worker` shim;
  - posting `{ imb: 'activate' }` on pointerdown and focus, so a click raises the window;
  - posting `{ imb: 'frame-blur' }`, which the page-wide keyboard guard depends on.

  The two posts go outside the craft's protocol, on `window.postMessage`, as 158's `frame-blur`
  already does.

### C. Parent ↔ frame (the craft's protocol, prefix `<p>`)

| Message | Direction | The desktop does |
|---|---|---|
| `<p>:ready {version}` | frame → parent | Send `<p>:open` with the window's file, if any; mark the window mounted |
| `<p>:open {name, bytes}` | parent → frame | Transfer the `ArrayBuffer` |
| `<p>:save {name, bytes}` | frame → parent | Decision 3; then a toast, or an error toast on failure |
| `<p>:dirty {dirty}` | frame → parent | Set the window's `•` and the async close guard (brief 102) |
| `<p>:failed {error}` | frame → parent | The window's error panel |

The parent accepts a message only when `event.source === iframe.contentWindow`, and validates its
shape:
- `name` is 1–255 chars with no `/` or NUL;
- `bytes` is an `ArrayBuffer` of at most 256 MB;
- saves are rate-limited.

Keep the handling DOM-free (`craftBridge.ts`, next to `sandboxBridge.ts`) and test it with vitest.

## Chunks

0. **Spike: a gate, before any other chunk.** Serve GridCraft's v0.8.0 web zip under a sandbox
   route with 158's CSP, plus the inline-script hash, in a scratch harness that is not committed.
   Load a hand-written `page-runtime.js` (contract B) first. In Chrome, record:
   - it renders, on WebGPU or the WebGL2 fallback;
   - the keyboard reaches it, and the page-wide keyboard guard still holds;
   - eframe starts on the in-memory storage, and fails how without the shim;
   - **copy and paste** between a cell and Notepad, both ways. egui's clipboard in an opaque
     origin may need `allow="clipboard-read; clipboard-write"` on the iframe, or may not work at
     all. A spreadsheet you cannot paste into fails this brief;
   - which context breaks first with five craft windows plus Hollow open.

   Unpatched v0.8.0 has no bridge that works in an opaque frame, so the spike proves rendering,
   keyboard, storage and clipboard only. Open and save are proven after chunk 1. If it can't
   render, or can't paste, stop and return to the owner with the finding.
1. **Upstream bridge PRs** (owner's account; decision 4): CADCraft, GridCraft and PdfCraft get the
   source check; WordCraft and DeckCraft get a new `host` module. Record each PR URL in this brief's
   outcome.
2. **Backend** (`apps/backend/src/modules/marketplace/**`):
   - schema v2, plus the release download and unzip (contract B);
   - `page-runtime.js` and the `index.html` rewrite (contract B), with the runtime added to
     `nest-cli.json` assets like 158's;
   - a migration for `frame` and `opens`;
   - unit and e2e tests: a bad hash is refused, zip-slip is refused, headers are on every file, the
     inline-script hash is in the CSP, and uninstall revokes tokens.
3. **Desktop host** (`apps/core/src/modules/marketplace/`):
   - `CraftAppHost.tsx` plus `craftBridge.ts` (contract C);
   - `document` handled in the parent through `system.fs` and `filePortal`;
   - associations read `opens` from marketplace apps;
   - the consent card's text for `document`.
4. **Five descriptors** in `marketplace/`, pinned to releases that include the bridge PRs (or the
   owner's fork zips), plus `.dxf`/`.dwg` → CADCraft as the default.
5. **Docs and corpus** (controller):
   - `decisions-marketplace.md` gets the two revisits (prebuilt catalog entries for sandboxed apps;
     the `document` grant);
   - `glossary.md` gets "craft app" and "document grant";
   - `status.md`, `log.md`, and the author's notes in `marketplace/README.md`.

## Must preserve

- Brief 120's catalog flow and brief 158's URL flow, with all their tests.
- No craft file is served without the sandbox headers.
- No new runtime dependency in the image, no sudo, no Rust toolchain in the image.
- Docs, Sheets, Slides, PDF Viewer and norPDF are unchanged, and still the defaults for their
  types.

## Acceptance

- `npm run typecheck`, `lint`, and the backend unit, backend e2e and core tests pass.
- In Chrome, on the local stack, all five install from the pane, and for each one:
  - a file opened from Files appears in the app;
  - Save overwrites it, and Files shows the new bytes;
  - an export goes through the Save dialog;
  - the close guard asks while there are unsaved changes;
  - a click raises the window, and copy and paste work to and from another app.
- From inside a craft frame:
  - `fetch('/api/marketplace')` is 401;
  - `parent.document` throws;
  - `fetch('https://example.com')` is blocked.
- An adversarial security review of the diff before commit, as for 158.

## Open questions for the owner

- Confirm decisions 1–6. Decision 1 (A over B) is the expensive one.
- Should `.pptx` default to DeckCraft once it can edit and save?
- Who opens the upstream PRs: the owner by hand, or Claude from the owner's account with the
  owner's go-ahead?
