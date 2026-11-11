# ImbatranimOS

A real Linux desktop in the browser: a React desktop (`apps/core`), a UI kit (`packages/ui`), 15 add-ons
(`apps/add-ons/*`), a NestJS backend (`apps/backend`) and a Rust Wayland host. Read
[corpus/index.md](corpus/index.md) first.

## Commands

- `npm run dev`: the dev container through Docker Compose (`scripts/dev.mjs`).
- `npm run check`: typecheck, lint, format check, conventions, tests. Run it before every hand-back.
- `npm run check:fast`: the typecheck of the changed workspaces, then ESLint on the changed files. The Stop hook runs
  it.
- One test: `npx vitest run <file>` in a web workspace, `npx jest <file>` in `apps/backend`.
- `npm run format`: Prettier writes every file it covers (Markdown stays out).
- `npm run version:bump -- --stage`: before every `git commit`, never before `--amend`.

## Places that mislead

- Every commit bumps the minor version (`npm run version:bump -- --stage`), in four files.
- The dev container is Docker, not your shell: `infrastructure-dev-1` and its Nix volume are reused, not rebuilt.
- The root font size is 13 px (on `html`), so `rem` is not 16 px.
- The backend is TypeScript 5.9 with decorators; the rest is TypeScript 6. Lint runs once at the root with typed rules.
- `apps/docs` (Docusaurus) is outside lint, knip and the house rules; `vendor/house-style/` is a generated copy that
  `npm run house-style:sync` refreshes. Never edit it.
- `apps/wayland-host`, `infrastructure/nix` and `iso/` are not TypeScript and no check here touches them.
- `packages/ui` is vendored by imbatranim-apps; its props are a contract.

## Hard rules

- **The OS is real, not simulated**: the terminal is a real PTY and the files are the real file system.
- **The shell user is `imbatranim`, with no sudo.** No change grants root or runs the container privileged.
- **Internet-exposable means auth everywhere**: no route or WebSocket without session validation, no default password.
- **Lightweight is identity**: a dependency needs a reason.
- **No secrets** in the corpus or the repo; name a secret by its variable.
- **No CI.** Don't add GitHub Actions or runners.
- **No pushes.** Commit locally; the owner pushes. Deploys are owner steps.
- The corpus rules are in [corpus/CLAUDE.md](corpus/CLAUDE.md).

## brief-board

Brief progress goes on brief-board. Run `brief-board guide` before you start or resume a brief, and follow it.
