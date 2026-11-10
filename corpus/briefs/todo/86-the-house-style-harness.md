# Task 86: The house style and the quality harness

**Depends on:**

- In this repo: brief 85 (Base UI at 1.9.0), so the harness starts from the version the estate runs.
- In the owner's skills library:
  - brief 27, *A house style, and a quality harness that enforces it*: the vendored `house-style` copy, the `house-style` skill, and the plugin's `Stop` and `PostToolUse` hooks;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: how the convention checkers are wired and when they run `--warn-only`.
- The owner's grilling of 2026-11-10 and its technical calls (Q5-Q14, Q44-Q51).

**Runs before:** 87 and 88. The reformat touches nearly every TypeScript file, and those briefs rewrite many of them. Formatting first gives one clean reformat commit.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

On 2026-11-09 the owner asked for the researched conventions to be enforced in every web app, keeping best practice and the house style. The skills library's brief 27 defines a two-layer harness:

- **The repo's gate:** `npm run check` and its fast subset `npm run check:fast`. They hold for a human, an agent and the deploy.
- **The Claude Code layer:** the plugin's `Stop` hook runs `check:fast`, its `PostToolUse` hook formats each saved file, `.claude/rules/*.md` are scoped by `paths:`, and a short root `CLAUDE.md` holds the commands.

This brief adopts both in ImbatranimOS, for its TypeScript workspaces: `apps/core`, `packages/ui`, the 15 add-ons under `apps/add-ons/`, `apps/backend` (NestJS) and `apps/docs`. The Rust host (`apps/wayland-host`), `infrastructure/nix` and `iso/` are out of scope, and nothing here measures or touches them.

### What the repo has today (measured 2026-11-10 on a scratch copy of the TypeScript workspaces; `node_modules` symlinked, `target/`, `iso/` and the Nix folder left out)

**The workspaces.** Counted with `git ls-files` per folder, `.ts .tsx .js .mjs .cjs`:

| Workspace | Files | Lines | Test files |
|---|---|---|---|
| `apps/core` | 238 | 32,201 | 71 |
| `packages/ui` (the kit) | 42 | 3,493 | 7 |
| `apps/add-ons/*` (15 packages) | 303 | 37,862 | 57 |
| `apps/backend` (NestJS 11, jest) | 260 | 53,431 | 98 |
| `apps/docs` (Docusaurus) | 10 | 785 | 0 |
| `scripts/` | 5 | 465 | 1 |

**Prettier.** Prettier 3.8.3 is pinned exactly (root, core, kit, add-ons, backend). Four configs, none shared:

- `apps/core/.prettierrc` and `apps/add-ons/.prettierrc`: no semicolons, single quotes, `trailingComma: "es5"`, width 100, `prettier-plugin-tailwindcss` (it sorts the class names, and stays);
- `apps/backend/.prettierrc`: single quotes, `trailingComma: "all"`, semicolons, Prettier's default width 80;
- the kit and add-ons reach theirs through `format:check`: `prettier --check src`.

There is no root `format` script. The root `format:check` is `turbo format:check`. **It fails today:** `cd apps/core && npx prettier --check .` reports `src/shared/components/desktop/Desktop.test.tsx` (the object at line 24 is wider than 100) and `src/assets/fonts/README.md`.

**Churn from the house style.** Prettier with `semi: true`, `singleQuote: false`, `trailingComma: "all"`, the tailwind plugin, on `src/**/*.{ts,tsx}` (`apps/backend` adds `test/`). Command per width: write with `--config` and read `git diff --shortstat` per workspace in the scratch copy.

| Width | `apps/core/src` | `packages/ui/src` | `apps/add-ons` | `apps/backend` (`src`) |
|---|---|---|---|---|
| 100 | 234 files, 15,338+ 15,306- | 40 files, 1,168+ 1,165- | 288 files, 15,702+ 15,626- | 233 files, 9,433+ 12,535- |
| **120** | 234 files, 15,249+ 16,226- | 40 files, 1,146+ 1,253- | 288 files, 15,502+ 16,881- | 233 files, 9,395+ 13,876- |
| 130 | 234 files, 15,223+ 16,471- | 40 files, 1,137+ 1,277- | 288 files, 15,388+ 17,407- | 233 files, 9,359+ 14,270- |
| 150 | 234 files, 15,183+ 16,933- | 40 files, 1,139+ 1,308- | 288 files, 15,333+ 18,066- | 233 files, 9,286+ 14,706- |

So the house style rewrites **every TypeScript file** in the web workspaces (234 of core's 238, 40 of the kit's 42, 288 of the add-ons' 303), and the width changes little on top of that. For comparison, today's own style at width 120 touches 134 core files (427+ 1,419-), 20 kit files and 157 add-on files, so the width alone is not the cost. The backend already has semicolons and `all`; its change is the quotes and the wider lines. Its `test/` folder adds 24 files (2,660+ 3,974- at 120).

**tsconfig.** Four unrelated bases:

- `apps/core/tsconfig.app.json` (own flags: `strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`);
- `apps/add-ons/tsconfig.base.json`, which the 15 add-ons and `packages/ui/tsconfig.json` extend (the same flags);
- `packages/tsconfig.base.json`, which has the full house list (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`) but which **no tsconfig extends** (`grep -rn "tsconfig.base" apps packages --include=tsconfig*.json`). [docs/adding-an-app.md](../../../docs/adding-an-app.md) and [wiki/decisions.md](../../wiki/decisions.md) name only the add-on one;
- `apps/backend/tsconfig.json` (NestJS: `module: nodenext`, decorators on, `strictNullChecks` and `noImplicitAny` only, `noFallthroughCasesInSwitch: false`).

Compiler counts, added one flag at a time (`tsc --noEmit -p <project> --incremental false`, TypeScript 6.0.3, over core's `tsconfig.app.json`, the kit and the 15 add-ons; a kit error repeats in each add-on that compiles it, so sums overcount):

| Flag | Errors |
|---|---|
| `noImplicitOverride` | 9, all in `apps/core` |
| `exactOptionalPropertyTypes` | 158 summed; 63 in core, 4 in the kit |
| `noUncheckedIndexedAccess` | 664 summed; 372 in core, 8 in the kit, 49 in Calendar, 61 in File Manager |
| backend `--strict` | 55; 50 are `TS2564` (DTO and entity fields without an initialiser) |

The base typecheck is clean today: 0 errors across those 17 projects, about 69 s serial and cold on this machine.

**ESLint.** Core, the kit and each add-on have their own flat config (`apps/core/eslint.config.js`; `apps/add-ons/*/eslint.config.js`), all `@eslint/js` recommended, `typescript-eslint` recommended untyped (8.64.0), `react-hooks` recommended, `react-refresh`, `eslint-config-prettier` and the import boundary rules. ESLint is 10.x inside each web workspace and 9.39.5 at the root, because the backend asks for `^9.18.0` and TypeScript `^5.7.3` (resolved 5.9.3) and npm hoists those. [wiki/decisions.md](../../wiki/decisions.md) (2026-08-06) defers the backend's move to TypeScript 6 and ESLint 10 as "its own brief".

`apps/backend/eslint.config.mjs` already runs `recommendedTypeChecked` through `projectService` (line 22), with `no-floating-promises` as a warning (line 30), `no-explicit-any` off (line 29), and Prettier run as a lint rule (`eslint-plugin-prettier`, lines 3 and 32).

`npx eslint .` in `apps/core` (11 s) finds 0 errors and 1 warning: `react-hooks/exhaustive-deps` at `src/shared/components/files/FilePicker.tsx:122`.

**The house shapes**, counted with `grep` over `apps/core/src`, `apps/add-ons/*/src`, `packages/ui/src`, `apps/backend/src` and `apps/backend/test`:

| Shape | Count | Where |
|---|---|---|
| `enum` | 1 | `apps/backend/src/modules/http-proxy/dto/http-proxy.dto.ts` |
| `any` (keyword) | 16 | 1 each in files such as `apps/core/src/system/network.ts`, `apps/core/src/shared/store/windowStore.ts`, `apps/backend/src/modules/pty/pty-session.ts`; `no-explicit-any` is off in the backend |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | 0 | |
| `TODO` / `FIXME` / `XXX` / `HACK` markers | 1 | |
| default exports | 1 | `apps/core/src/App.tsx:23`, plus config files |
| `console.*` in web source | 22 | non-test, outside the `scripts/` folder (list in step 1) |
| parameter properties | 0 in the web workspaces, **about 30 constructors in the backend** | NestJS dependency injection |

### Typed lint, measured

One ESLint run per measurement, with `projectService`, over the web workspaces (548 files, 43 s), and one over the backend (259 files, 15 s). The typed rules and the house shapes as errors:

| Rule | Web source + tests | Of which tests | Backend | Notes |
|---|---|---|---|---|
| `no-floating-promises` | 21 | 3 | 0 | File Manager 12, Notepad 4, core 3 |
| `no-misused-promises` | 16 | 0 | 0 | File Manager 6, Snipping Tool 5 |
| `await-thenable` | 0 | | 0 | |
| `switch-exhaustiveness-check` (`considerDefaultExhaustiveForUnions`) | 1 | 0 | 0 | `packages/ui/src/lib/fileFailureText.ts:65` |
| `no-unnecessary-type-assertion` | 30 | 15 | 0 | core 22 |
| `consistent-type-imports` | 5 | 3 | 44 (43 in tests) | `import()` type annotations: `apps/add-ons/code-editor/src/CodeEditor.tsx:36`, `apps/core/src/shared/registry/marketplace.tsx:442` |
| `no-non-null-assertion` | 231 | 175 | 150 (113 in tests) | Q47: an error in source, a warning in tests; 56 in web source, 37 in backend source |
| `no-restricted-syntax` (enum, default export, parameter property) | 1 (`App.tsx:23`) | | 137 (about 135 are parameter properties) | the backend carve-out below |
| `no-console` | 29 | 9 | 5 | 20 web source sites, in `apps/core` (11) and the add-ons |
| `no-warning-comments` with `todo` anywhere | 6 | 0 | 12 | **all false positives**: the word "Todo" in prose (the Todo app's name), e.g. `apps/core/src/shared/store/oldDataStore.ts:57`, `apps/core/src/contract.ts:102`. Real markers: 1 |
| `no-explicit-any`, `ban-ts-comment` | 0 | | 2 | the backend's `any` |

The 32 `react-hooks/*` and `react-refresh/*` lines in the raw output are not findings: they are `eslint-disable` comments naming rules the scratch config did not load.

**Not measured here:** knip's findings, `@vitest/eslint-plugin`'s count, `check:fast`'s warm time, and `projectService` against `project`. Step 1 measures them.

**Where the 13 px lives, and the Claude layer.** There is no root `CLAUDE.md`, and the only `.claude/` content is `settings.local.json` and a `codegraph` skill. `.gitignore` has no `.claude` line, so `.claude/rules/` would be tracked. The only `CLAUDE.md` is [corpus/CLAUDE.md](../../CLAUDE.md), which Claude Code loads only once an agent reads under `corpus/`.

## Owner decisions (settled 2026-11-10, from the technical calls)

1. **`house-style` is vendored** (Q6): a copy with a version header, refreshed by a `house-style:sync` script that finds the checkout by name. This repo's Docker build has no `git` in its `npm ci` layer, so a git dependency would not install.
2. **Prettier width 120** (Q8, Q51), and **the outliers move to double quotes and semicolons** (Q9) in one reformat commit. Here that is the whole web side and the backend's quotes: every TypeScript file changes (table above).
3. **`prettier-plugin-tailwindcss` stays.** This repo has Prettier, so Prettier sorts the class names. `eslint-plugin-better-tailwindcss` is added for its **correctness** rules only (unregistered, conflicting, duplicate and deprecated classes), not for class order.
4. **tsconfig** (Q11, Q50). `verbatimModuleSyntax` and `erasableSyntaxOnly` are already on in the web workspaces. Add `noImplicitOverride` (9 fixes). `noUncheckedIndexedAccess` is **deferred** (664 summed, 372 in core) to a later brief, and `exactOptionalPropertyTypes` waits for its own count decision (158 summed). One base file for the web: `packages/tsconfig.base.json`.
5. **The six typed rules, the house shapes as errors** (Q12, Q13, Q47, Q48): `console` allowed under `scripts/` and in CLIs, a default export allowed only in config files. `App.tsx:23`'s default export becomes a named export, with its one import at `src/main.tsx:10` updated.
6. **`check:fast`** (Q10): a typecheck plus ESLint on the changed files, target 15 s, up to about 30 s accepted.
7. **The Claude Code layer lives in the plugin** (Q7). A root `CLAUDE.md` (Q46) and `.claude/rules/`.
8. **Markdown stays out of Prettier** (Q45).
9. **The checkers read the repo's roots from `conventions.json`**, and config read at import time is allowed.

## Owner decisions (defaults)

- **The NestJS backend is a carve-out.** `erasableSyntaxOnly` and the parameter-property ban cannot apply: Nest reads constructor parameters through `emitDecoratorMetadata` (about 30 constructors, 135 findings). The backend takes the formatter, the typed lint it already has (with `no-floating-promises` raised to an error, 0 findings), `no-explicit-any` and the console rule, and `eslint-plugin-prettier` goes (Prettier runs on its own, not as a lint rule). `strict` is **not** added: 55 errors, 50 of them `strictPropertyInitialization`. Moving the backend to TypeScript 6 and ESLint 10 stays the deferred brief of 2026-08-06. *Question for the owner: write that brief now?*
- **`apps/docs` (Docusaurus)** gets Prettier and the typecheck it has, and no house lint config of its own.
- **`.npmrc` with `save-exact=true`**: none today, and every dependency is a range. Default: add the file so new dependencies are pinned, and leave the existing ranges for a later sweep. *Question for the owner.*

## Files you OWN

- Config: `apps/core/.prettierrc`, `apps/add-ons/.prettierrc`, `apps/backend/.prettierrc` (to one root `prettier.config.*`), `.prettierignore` files, `.git-blame-ignore-revs`, `.npmrc`.
- `packages/tsconfig.base.json`, `apps/add-ons/tsconfig.base.json`, `apps/core/tsconfig.app.json` (to extend the one base).
- Every `eslint.config.*` in the TypeScript workspaces, `eslint.config.js` of the kit included.
- Root `package.json` (scripts and devDependencies), the workspaces' `package.json` scripts and `package-lock.json`.
- The reformat itself: whitespace, quote and semicolon changes to every file Prettier covers.
- The fixes the new rules ask for, in `apps/core/src`, `packages/ui/src`, `apps/add-ons/*/src` and `apps/backend/src`.
- New: `scripts/conventions.json`, `.claude/rules/*.md`, root `CLAUDE.md`, the vendored `house-style` copy and its sync script under `scripts/`.
- [corpus/CLAUDE.md](../../CLAUDE.md): the **Hard rules** (project invariants) and **brief-board** sections stay, and a pointer to the root `CLAUDE.md` is added.
- Corpus: [wiki/decisions.md](../../wiki/decisions.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- Behaviour. Apart from the fixes listed, every change is formatting or configuration.
- `apps/wayland-host`, `infrastructure/nix`, `iso/` and `marketplace/*.json`.
- `apps/backend/src` structure and its decorators.
- The skills library and its `house-style` source. A rule that seems wrong here is reported back, not patched locally.

## What to do

Run `npm run version:bump -- --stage` before every `git commit`, never before `--amend` (the repo's rule). One commit per step. After each, `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.

1. **Measure first.** Record in the `log.md` entry the counts above that this brief marks "not measured": knip's findings, `@vitest/eslint-plugin` recommended's count (set `assertFunctionNames` to include the repo's own helpers if a test file uses one), `projectService` against `project`, and the 20 non-test `console` sites with a verdict each (CLI or entry point, allowed; otherwise a fix). Bring any rule over about 20 real findings, or mostly false ones, to the owner before turning it on. `no-warning-comments` must use `location: "start"` or a case-sensitive `TODO:`/`FIXME:`; the 6 "Todo" hits show why.
2. **One base tsconfig.** Make `packages/tsconfig.base.json` the base: the web variant needs `types: ["vite/client"]` and `jsx: "react-jsx"`, so keep those in each workspace and move only the flags. Take `noUncheckedIndexedAccess` out of it, with a comment that Q50 defers it and a count (372 in core). `apps/add-ons/tsconfig.base.json` and core's `tsconfig.app.json` extend it. Add `noImplicitOverride` and fix the 9 core sites. Update [docs/adding-an-app.md](../../../docs/adding-an-app.md) to the new base.
3. **Prettier, and the reformat.**
   1. Add one root `prettier.config.*`: `printWidth: 120`, double quotes, semicolons, `trailingComma: "all"`, the tailwind plugin for the web workspaces. Delete the three `.prettierrc` files.
   2. Add `.prettierignore`: `*.md`, `dist/`, `.turbo/`, `package-lock.json`, `apps/wayland-host/`, `infrastructure/`, `iso/`, `apps/docs/.docusaurus/`, `apps/docs/static/reference/`.
   3. Add `format` and `format:check` scripts at the root and fix the two files `format:check` reports today. Commit this alone.
   4. Run `npm run format` and commit only that, as `style: format with Prettier`. Run it when no other brief has uncommitted work.
   5. Add that commit's full hash to `.git-blame-ignore-revs`, in its own commit. Hand the owner the one-time `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
4. **ESLint.** One house config (the vendored copy), each workspace passing its roots; the diff in effect against today's:

   | Rule | Today | After | Findings today |
   |---|---|---|---|
   | the six typed rules | off in the web, `recommendedTypeChecked` in the backend | error, `projectService` | web 21 + 16 + 0 + 1 + 30 + 5 (steps 1 and 5) |
   | `no-non-null-assertion` | off | error in source, warn in tests | 56 web source, 37 backend source |
   | `no-restricted-syntax` on `TSEnumDeclaration` | off | error | 1 (backend DTO) |
   | default exports | off | error outside config files | 1 (`App.tsx:23`, made named) |
   | `no-console` | off | error outside `scripts/` and CLIs | 20 web source |
   | `no-warning-comments` (anchored) | off | error, pointing at `corpus/todos/` | 1 real |
   | `no-explicit-any` (backend), `ban-ts-comment` | off in the backend | error | 2 |
   | `eslint-plugin-prettier` in the backend | on | removed | |
   | `@vitest/eslint-plugin` recommended | off | error | step 1 |
   | `better-tailwindcss` correctness rules | absent | error in the web | step 1 |
   | `react-hooks` recommended, import boundaries | on | unchanged | 1 warning (`FilePicker.tsx:122`) |

   Keep the add-ons' import boundary rules (they carry the system-handle seam). Fix what the rules find, or list each finding left with its reason in the outcome note.
5. **The gate.** At the root:
   - `check` runs `typecheck`, `lint`, `format:check`, `check:conventions` and `test`;
   - `check:conventions` is knip plus the two convention checkers (`check-base-ui` runs `--warn-only` until brief 87 is done; `check-structure` is not wired, because the server is NestJS);
   - `check:fast` runs `typecheck` filtered to the changed workspaces (turbo's `--filter=...[HEAD]`), then ESLint on the changed files plus untracked ones. A small Node script in `scripts/`, no shell-only syntax. `turbo test` also runs `test:e2e` at 50% concurrency, so `check:fast` does not run tests.

   Time `check:fast` warm with one changed file and `check` in full, and record both.
6. **`.claude/rules/`**, each file under about 40 lines with `paths:` frontmatter:
   - `web.md` (`apps/core/src/**`, `packages/ui/src/**`, `apps/add-ons/*/src/**`): read [wiki/ui-conventions.md](../../wiki/ui-conventions.md); semantic tokens only; an add-on imports only `@imbatranim/ui`, the injected `system` handle and its own deps; no `dark:` variants (token blocks carry the modes); Base UI only through the kit; test in Apricot light and Classic dark;
   - `backend.md` (`apps/backend/src/**`): NestJS modules, DTOs through zod, every route behind session validation, no default passwords, the shell user is `imbatranim`;
   - `rust.md` is **not** written here: the Rust host is out of scope.
7. **Root `CLAUDE.md`**, under about 60 lines: what the repo is, "read [corpus/index.md](../../index.md) first", the commands (`npm run dev`, `npm run check`, `npm run check:fast`, one test with `npx vitest run <file>`), the places that mislead (the Docker dev container, the version bump on every commit, the 13 px root), and the hard rules from [corpus/CLAUDE.md](../../CLAUDE.md).
8. **Corpus.** A [wiki/decisions.md](../../wiki/decisions.md) entry "The house style, formatted and checked" (width, vendored copy, the NestJS carve-out, the rejected alternatives and why), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md), then `bash corpus/lint.sh` clean.

## Acceptance

- [ ] `npm run check` passes. Its run time and `check:fast`'s (warm, one changed file) are in the outcome note, and `check:fast` is under about 30 s or the owner has accepted the time.
- [ ] `npx prettier --check .` passes at the root. The reformat is one commit, `git diff -w --stat <hash>^ <hash>` shows only quote, semicolon, comma and wrap changes, and the hash is in `.git-blame-ignore-revs`.
- [ ] `grep -rn "tsconfig.base" apps packages --include=tsconfig*.json` shows every web tsconfig extending `packages/tsconfig.base.json`. `npm run typecheck` is green and `noImplicitOverride` is on.
- [ ] ESLint reports 0 errors with every rule of step 4's table. The counts before and after, and every finding left with its reason, are in the outcome note.
- [ ] A deliberate `enum`, a `!` in source, a `console.log` in `apps/core/src`, a `// TODO:` and an `export default` each fail `npm run lint`. Revert them after.
- [ ] `docker build` of `infrastructure/Dockerfile` reaches the end of its `turbo build` layer.
- [ ] `.claude/rules/web.md` and `backend.md` have `paths:` frontmatter. The root `CLAUDE.md` is under about 60 lines and lists `npm run check`.
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 85 comes first. Brief 87 drops `check-base-ui`'s `--warn-only`.
- **imbatranim-apps vendors `packages/ui`** through `kit:sync` at a commit. The reformat rewrites every kit file, so its next sync shows a whole-file diff, and that repo (single quotes, Prettier of its own) takes the same house-style move in its own set. Hand the owner the reformat commit's hash: `kit:sync` should run at that commit or later, and that repo's `.prettierignore` must list its `vendor/` folder.
- The kit's public props do not change here, so `SHARED_KIT_VERSION` stays at 1.
- Brief 88 builds on the reformatted tree and the `check` gate.
