---
summary: The house style, formatted and checked (2026-11-11) — Prettier at 120 on the vendored house-style copy, one root ESLint config with the NestJS backend as a carve-out, one web tsconfig base, the check and check:fast gate, and what was rejected or left as a dated warning.
updated: 2026-11-11
---

# Decisions: the house style (2026-11-11)

Split out of [decisions.md](decisions.md), which has a 200-line cap. Same rule: changing an entry needs an explicit
revisit and a `log.md` entry.

## 2026-11-11 — The house style, formatted and checked

- **One format, one gate, for the web workspaces and the backend.** Prettier at width 120, double quotes,
  semicolons and trailing commas, from the estate's vendored `house-style` copy (`vendor/house-style/`, version
  1.1.0, refreshed by `npm run house-style:sync`). `prettier-plugin-tailwindcss` stays, so Prettier sorts class
  names; `eslint-plugin-better-tailwindcss` checks only that classes exist and are not deprecated. Markdown stays out
  of Prettier. The reformat is one commit (`645d06d`, listed in `.git-blame-ignore-revs`); it rewrote 866 files, the
  web workspaces' single quotes and no semicolons, and the backend's quotes and wrapping.
- **One ESLint config at the root** (`eslint.config.mjs`) calls the vendored `houseStyle()`, with the three import
  boundary blocks (core, the kit, the add-ons) kept as they were. The six typed rules, no `any`, no `!` in source,
  no enum, no default export outside configs and no `// TODO:` are errors. `check` is typecheck, lint, format
  check, conventions (knip, dependency-cruiser, `check-base-ui` warn-only) and tests; `check:fast` is the typecheck of
  the changed workspaces plus ESLint on the changed files.
- **The NestJS backend is a carve-out.** It takes the formatter and the typed lint it already ran
  (`recommendedTypeChecked`, `no-floating-promises` raised to an error), `no-explicit-any`, `no-non-null-assertion`
  and the console rule. It keeps parameter properties, decorators and `emitDecoratorMetadata`, so `erasableSyntaxOnly`
  and `strict` are not turned on (55 errors, 50 of them property initialisers), `eslint-plugin-prettier` is gone, and
  it stays on its own TypeScript 5.9. The root's TypeScript 6 runs the lint and `ts-jest`, so the backend's tsconfig
  names its `@types` packages. check-structure is not wired: the server is NestJS, not Fastify.
- **One tsconfig base for the web**: `packages/tsconfig.base.json`, with `noImplicitOverride` on.
  `noUncheckedIndexedAccess` stays off (664 errors summed, 372 in core), and so does
  `@typescript-eslint/no-unnecessary-type-assertion`, whose autofix would strip every `!` on an indexed read. Both
  come back together.
- **Rejected:** a git dependency for the config (the image's `npm ci` has no git); a second `.prettierrc` per
  workspace (four unrelated styles); a blanket `no-console` warning (the 20 browser diagnostics carry a dated
  disable instead, until the desktop has a client logger); deleting knip's 6 dead core files and 160 unused exports
  in the same change (accepted in `knip.config.js` with a note).
- **Temporary warnings, each dated in its config:** `n/no-process-env` in the backend source (46 reads in 18 files),
  dependency-cruiser's `no-circular` (57 cycles in core and the backend).
