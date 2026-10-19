# @imbatranim/docs-site

The ImbatranimOS documentation site, built with Docusaurus 3. It has two halves,
and neither is typed twice:

- **Narrative** (architecture, decisions, status, roadmap) is **rendered from
  [`corpus/`](../../corpus/)**, the wiki the project already keeps.
  `scripts/sync-corpus.mjs` writes every page in `corpus/wiki/`, plus
  `corpus/log.md`, into `docs/wiki/`. It rewrites the frontmatter to Docusaurus's
  keys and turns corpus links into file links that the build checks. Links to
  anything the site does not render (briefs, source files) go to GitHub.
  `docs/wiki/` is generated and gitignored: **edit the source in `corpus/`,
  never `docs/wiki/`.** To keep a wiki page off the site, add its slug to the
  script's `DENY` set.
- **Reference** (API shape) is **generated from the TypeScript**:
  - **Compodoc** documents `apps/backend`: NestJS modules, controllers, routes,
    the DI graph and a coverage report, in `static/reference/backend/`.
  - **TypeDoc** documents the `@imbatranim/core` public barrel
    (`apps/core/src/index.ts`) in `static/reference/core/`.

The hand-written pages are MDX: the landing page is `src/pages/index.mdx` (no
sidebar), and the rest are in `docs/`. Their components (`Hero`, `Card` and
`CardGrid`, `Metrics`, `AppGrid`, `LayerStack`, `Diagram`) are in
`src/components/`. The sidebar is `sidebars.ts`, and the theme is
`src/css/custom.css`: light only, no toggle, crimson accent.

## Commands

Run these from `apps/docs/`, or run `npm run docs` at the repo root, which runs
the full pipeline through Turborepo:

```bash
npm run sync-corpus   # corpus/ -> docs/wiki/
npm run diagrams      # diagrams/*.json -> static/diagrams/ (archify; skipped if absent)
npm run ref           # TypeDoc (core) + Compodoc (backend) -> static/reference/
npm run start         # sync + diagrams + the Docusaurus dev server
npm run docs          # sync + diagrams + ref + docusaurus build -> dist/
npm run typecheck     # tsc over the config and components
```

The dev server does not serve `static/reference/` until `npm run ref` has run
once.

To preview `dist/`, serve it under its base path with any plain static server.
`docusaurus serve` is not a faithful preview here: with `trailingSlash: true` it
redirects hashed files such as fonts to a 404, and search never loads.

```bash
mkdir -p /tmp/serve/imbatranim-os && ln -sfn "$PWD/dist" /tmp/serve/imbatranim-os/docs
python3 -m http.server 4323 --directory /tmp/serve   # http://localhost:4323/imbatranim-os/docs/
```

## Keeping the reference from rotting

- **TypeDoc** runs with `validation.notDocumented`, so every undocumented public
  export of `@imbatranim/core` prints a build **warning**. To make it a hard
  gate, set `"treatWarningsAsErrors": true` in `typedoc.json`.
- **Compodoc** fails the build under 35% documentation coverage
  (`ref:backend:gate`). Compodoc exits as soon as a coverage test passes, before
  it writes any HTML, so the gate is its own run and `ref:backend` generates the
  pages afterwards. Raise the threshold in `ref:backend:gate` as coverage
  climbs.

## The base path

The site is built for `/imbatranim-os/docs/`. The base is set in
`docusaurus.config.ts`, not passed in by the deploy, so a wrong base fails the
deploy's check by name. Hashed assets are under `<base>assets/`. Set
`DOCS_BASE` to build a copy for another path:

```bash
DOCS_BASE=/ npm run docs
```

The docs workspace is not part of the OS image: `.dockerignore` excludes
`apps/docs`, so the image's `npm ci` and `turbo build` never see it.
