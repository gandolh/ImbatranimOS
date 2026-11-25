# Brief 123: The core build prints no warnings

**Depends on:** nothing.
**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).
**Builder:** Opus: it splits the shell's entry chunk and Monaco, and both are checked in the running OS.

Filed 2026-11-25. The owner asked for the build warnings to be fixed in the most active repos (imbatranimOS had 53
commits outside the corpus in the two days before). `npx turbo build --force` exits 0. It ran two build tasks, and
only `@imbatranim/core` (Vite 8.3.5) printed anything, the warning below.

## Context

From the build on 2026-11-25, one warning, "Some chunks are larger than 500 kB", for two chunks:

- `index-*.js`, 621 kB (203 kB gzip): the shell's entry chunk.
- `editor.api-*.js`, 2,736 kB (706 kB gzip): Monaco's editor API, from the code-editor add-on
  (`apps/add-ons/code-editor/`).

`html.worker-*.js` (743 kB) is a worker asset, not a chunk, and doesn't warn.

## Decisions

All settled. None of them is open.

- **The entry chunk gets split, not hidden.** Load what the first screen doesn't need (apps and add-ons not open at
  start, heavy settings panes) with dynamic `import()` until no chunk of the OS's own code is over 500 kB.
- **Monaco is split by size first.** Confirm the editor loads only when the code editor or the diff tool opens
  (make it so if not). Then add a rolldown `codeSplitting` group for `monaco-editor` with `maxSize: 500_000` in
  core's Vite config. If the split pieces break Monaco (its workers, its CSS order, a failed import) or a piece
  stays over 500 kB, keep Monaco whole and set `build.chunkSizeWarningLimit` to 2,800 with a comment naming
  Monaco, its size and that it loads on demand. The outcome says which way it went.

## Files you OWN

- `apps/core/vite.config.ts`, `apps/core/src/` and `apps/add-ons/code-editor/src/` where an import becomes lazy
- `corpus/wiki/status.md`, `corpus/log.md`, and the wiki page on core's build if one exists

## Files you must NOT touch

- `apps/backend/`, `infrastructure/`, the Wayland host, other repos.

## Steps

1. See what fills the entry chunk (a bundle visualiser on core's build); note the top contributors in the outcome.
2. Make the big, not-first-screen parts lazy.
3. Split Monaco as decided.
4. Rebuild until the build prints no warning.

## Acceptance

- [ ] `npx turbo build --force` exits 0 and prints no warning; the outcome lists the chunk sizes before and after.
- [ ] `npm run check` exits 0.
- [ ] In the running OS (the dev container, the way the repo's `CLAUDE.md` walks it; its image needs a rebuild,
      since PR #6 changed `infrastructure/Dockerfile`): the desktop starts, the code editor opens a file with syntax
      colours, the diff tool shows a diff, and each app made lazy opens. No failed chunk request, no console error.
- [ ] `bash corpus/lint.sh` passes.

## Owner steps

- `node cli.ts imbatranim-os server` from vps-deploy (the image builds core from source).

## Owner decisions

- Settled 2026-11-25 (owner): "run build and fix all the warnings for the most active projects". Which repos count
  (more than 10 commits outside the corpus in two days) and how each warning is fixed are the controller's calls.
