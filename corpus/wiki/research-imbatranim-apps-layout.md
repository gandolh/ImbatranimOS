---
summary: How imbatranim-apps holds the apps that leave the image (2026-11-06), split out of research-imbatranim-apps.md. The three kinds of app are runtime needs, not install units: client only, a WASM engine from an npm package under a kit UI (needs the desktop CSP to allow wasm-unsafe-eval), and kit apps with a server. Install groups after the grill are Office, Games, Developer (Git GUI, REST API Client) and Accessories (Todo, Bookmarks); Start has no folders. The layout is unproven because the office build is anchored at the repo root, so the Games todo measures it. The rename keeps the descriptor id imbatranim-office. §4 is the checklist every move follows, with where backend modules go.
updated: 2026-11-06
---

# Research: how imbatranim-apps holds the apps (2026-11-06)

Split out of [research-imbatranim-apps.md](research-imbatranim-apps.md),
which has the ask, the measurements, the app-by-app table and the owner
decisions. Research only; nothing was built.

## 1. The three kinds of app

These are runtime needs of one app, not install units. One group can mix
them.

1. **Client only.** A kit app: TypeScript, the desktop's shared kit, no
   server. Every wave 1 app.
2. **A WASM engine under a kit UI.** The UI is still kit DOM; the heavy part
   is a C or Rust library compiled to WASM. It has to arrive as an npm
   package's prebuilt `.wasm`, pinned by the lockfile, the way CAD's server
   already takes LibreDWG. The box has no compiler, and the office repo commits
   no prebuilt artifacts, so "our Rust compiled at install" or "a `.wasm` in
   the repo" don't fit. A Rust toolchain from Nix, now in the image, is the
   alternative left out: its download, and `rustc` linking under the 1 GiB
   cap, are unmeasured, and the installer's allowlisted `PATH` would have to
   reach Nix first. Three changes make it possible:
   - the desktop CSP gains `'wasm-unsafe-eval'` (`security-headers.ts`; the URL
     apps' frame already has it, and `.wasm` is already served as
     `application/wasm`);
   - the office repo drops its "No WebAssembly in the apps" invariant and its
     consequence in `wiki/decisions.md`;
   - the OS records the CSP change. Nothing in the OS locks it today; the
     policy is only described as "deliberately conservative".

   The added risk is small: it lets scripts already on the page compile WASM,
   not injected text run as JavaScript, and catalog apps already run
   unsandboxed JavaScript in the page. Single-threaded only, since the OS
   sends no COOP/COEP headers. First users: CAD reading DWG in the tab, and
   PDF's JPEG2000 and JBIG2 decoders. A whole app drawn in a WASM canvas
   (Qt, egui) stays out
   ([research-remote-ui-rendering.md](research-remote-ui-rendering.md)).
3. **Kit apps with a server.** Office today: a `service` descriptor whose
   server starts when an app asks for it (`system.server.request()`).

## 2. Install groups

After the grill on 2026-11-06, each group is one catalog descriptor and the
unit you install:
- **Office**: Docs, Sheets, Slides, PDF and CAD. The descriptor id stays
  `imbatranim-office`, because installed rows are keyed by it.
- **Games**: Minesweeper and Solitaire. Hollow keeps its own game-engine
  descriptor.
- **Developer**: Git GUI and the REST API Client.
- **Accessories**: Todo and Bookmarks.

Installing a group is the opt-in, and each app in it can still be switched
off. Start has no folders; it gets search, pinned apps and an A-Z list
([decisions-themes.md](decisions-themes.md)).

Rejected:
- One suite for everything: a Calculator install would pull Office's
  `node_modules`, about 853 MB in the local checkout.
- One descriptor per app: twenty pins to bump, and a clone and install each.

**The layout is unproven.** Office's build is anchored at the repo root.
`osBuildConfig` finds apps under `<root>/apps`, the kit snapshot under
`<root>/vendor/imbatranim-ui`, and its own helpers under
`<root>/packages/shared`. A group in its own folder with its own lockfile
would import those helpers from outside its `node_modules`, so `vite`
wouldn't resolve. There are two ways out, and the Games todo measures both:

- **(a) One workspace.** One root lockfile, with each group descriptor running
  a scoped `npm ci --workspace=<group>`. This works only if npm really limits
  the install.
- **(b) Self-contained groups.** Each group has its own lockfile and its own
  copy of the build helper, or the helper as a `file:` package.

## 3. The rename

- **The descriptor id stays `imbatranim-office`.** The GitHub rename is the
  owner's step. GitHub redirects the old URL, so the pinned commit keeps
  installing; the descriptor's `source.repo` moves to the new URL anyway.
- **brief-board names a project after its folder** unless
  `corpus/board-name` says otherwise, and the office corpus has no such file.
  Renaming the folder starts a new board project at the next sync and
  leaves the old one's tickets behind. Either add `board-name` with
  `imbatranim-office`, or accept the new project.
- **The rest is words:**
  - the office corpus (its CLAUDE.md "Two repos, one product", glossary,
    decisions, README);
  - this repo's glossary entry and decisions-office-suite.md;
  - comments in `retiredApps.ts` and `marketplaceOpeners.ts`;
  - `@imbatranim-office/root`;
  - one message in vps-deploy's `rollout.ts`.
- **App ids keep `office-`.** They name the Office group, not the repo.

## 4. Moving one app: the checklist

Every move in the backlog (Games and the seven after it) follows these steps;
each adds only what is particular to its apps.

1. **Port.** In the group's folder of imbatranim-apps, using the layout the Games
   todo settled:
   - the app becomes a kit app that exports `App`, and its engines,
     components, stores and tests come across unchanged;
   - dependencies outside the shared kit (`zustand`, `dayjs`, `monaco-editor`)
     become the group's own, pinned to the versions the OS resolves.
2. **Same id.** The app keeps its built-in id, so pins, startup entries,
   Open-with choices and recents come back on install. It needs no
   `RETIRED_APP_IDS` pair.
3. **Catalog.** Add the app to the group's descriptor in `marketplace/`:
   - name, description, meta, window sizes, `multiInstance` and `opens`,
     copied from the manifest;
   - capabilities from the `system` calls it makes;
   - its icon in `ICONS` (`apps/core/src/shared/registry/marketplace.tsx`);
   - a new pin.
4. **Remove the built-in.** Delete its `apps/add-ons/` folder, its line in
   `manifest.ts`, its lockfile entries and the tests that name it.
5. **Without it.** Whatever opened it must say where it comes from, not do
   nothing. `openApp` on a missing id only warns in the console, so check
   every caller. File types it opened go into `SUITE_TYPES` in
   `marketplaceOpeners.ts` with the group's name.
6. **Walk.** In the dev container, from a `file://` copy of the repo:
   - **before**, set up the owner's choices and some data;
   - **after removing it**, check that nothing breaks;
   - **install the group**: record the time and the size, and check that the
     choices and data came back;
   - **uninstall**: check that it is gone and the data is still there.
7. **Corpus.** Update the research pages' tables, the group's line in the
   apps repo, status and log in both repos.

**Backend modules** (the grill, 2026-11-06,
[decisions-marketplace-suites.md](decisions-marketplace-suites.md)).
An installable app's data moves into real files in its own folder,
`~/.local/share/imbatranim/<app-id>/`, through `system.data`; its module is
deleted once the data has moved (Todo, Bookmarks, Git GUI's recent repos).
Modules that do system work stay as OS services (`archive`, `git`,
`http-proxy`). Built-in apps keep their modules.
