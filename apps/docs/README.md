# @imbatranim/docs

The ImbatranimOS documentation site. Two halves, kept honest by construction:

- **Narrative** (architecture, decisions, status, roadmap) is **rendered from
  the [`corpus/`](../../corpus/)** — the wiki the team already maintains.
  `scripts/sync-corpus.mjs` copies the curated pages into
  `src/content/docs/wiki/`, rewriting the corpus frontmatter into Starlight's
  schema and remapping intra-corpus links. Those files are generated and
  gitignored — **edit the source in `corpus/`, never `src/content/docs/wiki/`.**
- **Reference** (API shape) is **generated from the TypeScript**:
  - **Compodoc** documents `apps/backend` — NestJS modules, controllers,
    routes, the DI graph, and a coverage report → `public/reference/backend/`.
  - **TypeDoc** documents the `@imbatranim/core` public barrel
    (`apps/core/src/index.ts`) → `public/reference/core/`. When brief 48 lands,
    the `SystemHandle` protocol interface shows up here automatically.

Solution **B + C** from the docs-tooling proposal: generate the reference from
code (B), compose it with a Starlight site over the corpus (C). Solution A (a
hand-rolled static render) was intentionally skipped.

## Commands

Run from `apps/docs/` (or use `npm run docs` at the repo root, which runs the
whole thing through Turborepo):

```bash
npm run sync-corpus   # corpus/ -> src/content/docs/wiki/
npm run ref           # TypeDoc (core) + Compodoc (backend) -> public/reference/
npm run dev           # sync + astro dev server (reference must be built once)
npm run docs          # sync + ref + astro build  (the full pipeline)
npm run preview       # serve the built dist/
```

## Keeping the reference from rotting

- **TypeDoc** runs with `validation.notDocumented`, so every undocumented public
  export of `@imbatranim/core` prints a build **warning** — the coverage signal
  for the barrel (and later the `SystemHandle` spec). To make it a hard gate,
  set `"treatWarningsAsErrors": true` in `typedoc.json`; an undocumented export
  then fails the build. It is left as a warning today so the first build is
  green before the barrel is fully TSDoc-commented.
- **Compodoc** runs with `--coverageTest 35` (fails under 35% documentation
  coverage — a passing floor set just below the current ~39%). Ratchet the
  threshold up in the `ref:backend` script as coverage climbs.

## Deploying under a sub-path

The site builds for the root path. If you serve it behind a reverse-proxy route
(e.g. Caddy at `/docs`), set `site` and `base` in `astro.config.mjs` and
rebuild.
