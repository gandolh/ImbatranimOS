# Brief 160 — Move the docs site from Starlight to Docusaurus

## Context

On 2026-10-18 the owner decided to move every project's docs site from Astro
Starlight to Docusaurus. `apps/docs` (`@imbatranim/docs-site`, served at
`/imbatranim-os/docs/`) is the one the `corpus-docs-site` skill was first written
from, and it uses the most Starlight features of any site.

The recipe is written and verified. The `corpus-docs-site` skill
(personal-skills v0.31.0, source in
`~/projects/my-personal-skills/skills/corpus-docs-site/`) now scaffolds
Docusaurus 3.10, and `references/migrating-from-starlight.md` beside it holds
the file, config and content maps plus ten gotchas, each hit during a real
port. **Read that guide first.** Its `references/` folder has React versions of
this site's components: `Hero.tsx` (the splash hero), `Metrics.tsx`,
`Cards.tsx` (`Card`/`CardGrid`) and `Diagram.tsx`. If the installed plugin is
older than v0.31.0, read them from the source path.

What the site has today (2026-10-18):
- base `/imbatranim-os/docs/` (`DOCS_BASE ??`), light only (the two
  `Theme*.astro` overrides), 17 sidebar links in five groups, with the two
  reference links opening in a new tab;
- seven authored pages:
  - `index.mdx`: `template: splash`, a `hero:` with a tagline holding
    `<code>` and three actions (primary/secondary/minimal), `Metrics`, and
    cards with Starlight icons;
  - `tour.mdx`: `AppGrid`;
  - `architecture.mdx`: `LayerStack` and `Diagram`;
  - `ideas.mdx`, `stack.mdx`, `patterns.mdx` and `reference.mdx`: `Card`,
    `CardGrid` and `Aside`, plus `Metrics`;
- components `AppGrid.astro`, `LayerStack.astro`, `Metrics.astro`,
  `Diagram.astro` (one archify diagram);
- `scripts/sync-corpus.mjs` with a hand-kept list of 8 pages (repo root three
  levels up), and `scripts/build-diagrams.mjs`;
- TypeDoc (`typedoc.json`, the `@imbatranim/core` barrel →
  `public/reference/core`) and Compodoc (`ref:backend` →
  `public/reference/backend`, `--coverageTest 35`);
- a `turbo.json` `docs` task, and root `.gitignore` entries for the generated
  paths.

**Built through Docusaurus on 2026-10-18.** All 20 corpus pages (wiki + status +
log) built through the new sync in `markdown.format: 'detect'` mode, with no
broken links or anchors. In MDX mode the corpus does not compile. The splash
pattern (a page under `src/pages/` with `<Hero>`, `<Metrics>` and
`<CardGrid>`) was built and checked in a browser using this site's own
landing copy.

## Files you OWN

- `apps/docs/` (all of it, including `README.md`, which describes Starlight
  throughout)
- `turbo.json` (the `docs` task's `inputs`/`outputs`)
- `.gitignore` (the "Generated docs artifacts (apps/docs)" block)
- `.dockerignore` (the comment on `apps/docs` only: "(heavy, Astro)")
- `package-lock.json`, root `package.json` (version bump only, below)
- `corpus/routing.md` (line 45 "the public Starlight site", line 86
  `astro.config.mjs`/`src/content/`) and `docs/README.md` (line 18)

## Files you must NOT touch

- `corpus/wiki/*.md` link text. Fix the renderer, not the source.
- `apps/core`, `apps/backend`. TypeDoc and Compodoc read them; this brief does
  not change them.
- The `.dockerignore` rule itself. The docs workspace stays out of the image.
- vps-deploy. Its brief 11 switches the `imbatranim-os` docs stack's check from
  `_astro/` to `assets/`.

## What to do

1. **Baseline.** `npm run docs` (root, through turbo), then save
   `(cd apps/docs/dist && find . -name index.html | sort) > /tmp/ios-routes-before.txt`.
2. **Config.** Write `docusaurus.config.ts` from the skill's reference. Set
   baseUrl `process.env.DOCS_BASE ?? '/imbatranim-os/docs/'`,
   `trailingSlash: true`, `routeBasePath: '/'`, `markdown.format: 'detect'`,
   light-only `colorMode`, local search, and the GitHub navbar item. Port the
   five sidebar groups to `sidebars.ts`. "Overview" points at the landing page
   with `{ type: 'link', href: '/' }`. The two reference links become
   `{ type: 'link', href: 'pathname:///reference/backend/' }` (and `…/core/`).
   "How the reference is generated" stays a doc. Delete `astro.config.mjs`,
   `src/content.config.ts` and both `Theme*.astro`.
3. **package.json** per the guide: no `"type": "module"`, keep the
   `browserslist`, and add `start`/`docs`/`typecheck` scripts. The `docs` script
   is `sync-corpus && diagrams && ref && docusaurus build --out-dir dist`.
   `ref:backend`'s `-d` becomes `static/reference/backend`. Drop `astro`,
   `@astrojs/starlight` and `sharp`.
4. **Landing page.** `index.mdx` moves to `src/pages/index.mdx` (no sidebar,
   like splash). Write the hero as
   `<Hero title tagline={<>One <code>docker run</code>. …</>} actions={[…]} />`
   with the three actions and their variants. Card `icon` props are dropped.
5. **Other pages.** The other six `.mdx` pages move to `docs/`. Make these
   swaps:
   - `import { Card, CardGrid } from '@site/src/components/Cards'`;
   - each `<Aside type="x" title="y">…</Aside>` becomes `:::x[y] … :::` (a
     missing type is `note`);
   - local imports become `@site/src/components/X`.
   Port `AppGrid` and `LayerStack` to React. Scoped `<style>` becomes
   `X.module.css`, `class` becomes `className`, and the `not-content` class
   goes. Keep their literal light colours (the old
   `--sl-color-white/black` trap no longer exists, but literals are still
   right for a light-only diagram). Use the skill's `Metrics.tsx` and
   `Diagram.tsx`. `git mv public/diagrams static/diagrams`.
6. **Sync.** Use the skill's `sync-corpus.mjs` with `GITHUB_REPO` set to this
   repo's GitHub URL. The corpus has no cross-repo links. The old list was
   curated: it published 8 pages. Discovery adds twelve more:
   `backlog-2026-07-31`, `backlog-2026-08-07`, `code-graph`,
   `decisions-estate-era`, `decisions-iso-era`, `decisions-marketplace`,
   `decisions-pivot-era`, `feature-exploration-2026-08-06`, `norpdf`,
   `real-os-gaps`, `status-history` and `ui-conventions`. **Ask the owner** which
   stay unpublished and put those slugs in the script's `DENY` set. The two
   backlogs, the exploration and the status history read like working notes.
   Add the published ones to the sidebar where they belong.
7. **Reference.** `typedoc.json` `"out": "static/reference/core"`. Keep the
   Compodoc threshold as it is. Links from `docs/reference.mdx` to the
   reference use `pathname://`.
8. **Theme.** Port `src/styles/theme.css` to `src/css/custom.css` (the skill's
   `references/custom.css` is already this site's accent and white page).
9. **Wiring.** `turbo.json` `docs` inputs become `docs/**`, `src/**`,
   `static/**`, `scripts/**`, `docusaurus.config.ts`, `sidebars.ts`,
   `typedoc.json`, `../core/src/**`, `../backend/src/**` and `../../corpus/**`.
   Outputs become `dist/**` and `static/reference/**`. In the root
   `.gitignore`, `.astro/` becomes `.docusaurus/`, `src/content/docs/wiki/`
   becomes `docs/wiki/`, and `public/reference/` becomes `static/reference/`.
   Update `.dockerignore`'s comment wording, `routing.md`, `docs/README.md`, and
   rewrite `apps/docs/README.md` for Docusaurus (commands, the two halves,
   `docs/wiki/` is generated).
10. **Commit** per this repo's rule: `npm run version:bump -- --stage` before
    each `git commit`.

## Acceptance

- Root `npm run docs` (turbo) exits 0 with `onBrokenLinks: 'throw'`. TypeDoc
  warnings are allowed as before. The Compodoc gate passes.
- Route parity: the new route list equals `/tmp/ios-routes-before.txt` plus
  `./search/index.html` and a `./wiki/<slug>/` route for each of the twelve
  pages above that is not in `DENY`. Nothing is missing.
- `grep -c '/imbatranim-os/docs/assets/' apps/docs/dist/index.html` is non-zero,
  and `grep -rl '_astro' apps/docs/dist` finds nothing.
- `npm run typecheck -w @imbatranim/docs-site` passes.
- The OS image still excludes the docs workspace: `apps/docs` stays in
  `.dockerignore`, and an image build does not install any `@docusaurus/*`
  package.
- Browser check, with `dist/` served at `/imbatranim-os/docs/` by a plain
  static server (not `docusaurus serve`):
  - the landing page shows the hero, stat tiles and card grids with no sidebar;
  - `/tour/` (AppGrid) and `/architecture/` (LayerStack + diagram) render;
  - `/reference/backend/` and `/reference/core/` open from the sidebar;
  - there is no theme toggle;
  - search returns results.
  Screenshot the landing page and the architecture page.
- `bash corpus/lint.sh` passes.

## Out of scope

- Deploying. The owner deploys after vps-deploy brief 11 flips the
  `imbatranim-os` docs stack.
- New pages or a content rewrite.

## Outcome (2026-10-19)

**Done in `2442aaf`, plus `d275b42`.** `apps/docs` builds with Docusaurus
3.10.2 at the same base and URLs. The steps went as written, with these
results and changes:

- **Step 6, the owner's answer (2026-10-19):** publish all twelve pages.
  `DENY` is empty. The new pages are in the sidebar: the four era decision
  pages after "Decisions (locked)"; UI conventions, norPDF, the code-graph
  layer and real-OS gaps under "Deep dive"; and the status history, both
  backlogs and the feature exploration under "Status & roadmap".
- **The backend reference had never been built.** Compodoc stops with
  `process.exit(0)` as soon as a `--coverageTest` run passes, before it writes
  any HTML. Only a stray `js/routes` file reached `dist/reference/backend/`,
  so the Starlight site's Backend link went to a 404 (the baseline route list
  has no `reference/backend/index.html`). The 35% gate is now its own run,
  `ref:backend:gate`, and `ref:backend` then generates the pages. The
  threshold is unchanged. A gate at 99% fails the build, exit 1, as it
  should.
- **A stale anchor:** `/patterns/#the-seam` on the ideas page never existed.
  The heading's id is `the-seam--apps-receive-a-capability-handle`.
  Docusaurus reports broken anchors, so it now points there.
- **TypeScript 6** rejects the deprecated `baseUrl` in
  `@docusaurus/tsconfig`, so `tsconfig.json` sets it to `null`. `@site/*`
  resolves without it.
- **The archify diagram** showed the production host on its Caddy node. It
  now reads "TLS :443" (`d275b42`).
- The leftover `.astro/` cache was deleted. `npm install` added 972 packages
  and moved 19 shared packages up by a patch or minor version (webpack,
  terser, browserslist, Babel and others).

**Verified:**
- Root `npm run docs` (turbo) exits 0 with `onBrokenLinks: 'throw'`. The sync
  writes 20 pages and prints no warnings. Compodoc reports "53% is over
  threshold (35%)". The TypeDoc warnings are unchanged (0 errors, 23
  warnings). No broken anchors.
- **Route parity:** nothing is missing from `/tmp/ios-routes-before.txt`.
  These routes were added:
  - `./search/`;
  - the twelve `./wiki/<slug>/` pages;
  - `./reference/backend/` (the fix above);
  - `./reference/backend/template-playground-app/`, which Compodoc 2.x writes
    on its own.
- `dist/index.html` references `/imbatranim-os/docs/assets/`, and no file in
  `dist/` mentions `_astro`.
- `npm run typecheck -w @imbatranim/docs-site` passes.
- **The image:** `apps/docs` stays in `.dockerignore`. The `docker` CLI was
  not available in this WSL distro, so the image was not built. Instead,
  `npm ci --ignore-scripts` ran on the deps stage's manifests (root
  `package.json` and lockfile, backend, core, add-ons, `packages/*`). It
  installed 1,569 packages, none from `@docusaurus/*`, `@easyops-cn` or
  `typedoc`.
- **Browser:** `dist/` was served at `/imbatranim-os/docs/` by `python3 -m
  http.server`, and checked in headless Chrome.
  - The landing page shows the hero (three actions), five stat tiles and the
    card grids, with no sidebar.
  - `/tour/` shows the AppGrid: 5 groups, 30 apps.
  - `/architecture/` shows the LayerStack (3 layers) and the diagram frame
    (200).
  - Both reference links open from the sidebar in a new tab: "ImbatranimOS
    Backend API" and "@imbatranim/core — public surface".
  - There is no theme toggle, and `data-theme` is light.
  - Searching "compositor" returns the OS-layering page.
  - A new page (`/wiki/decisions-marketplace/`) renders with its sidebar
    entry active.

**Left for the owner:** the deploy, after vps-deploy brief 11 switches the
`imbatranim-os` docs stack's asset check to `assets/`.
