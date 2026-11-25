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

## Outcome (2026-11-25)

Built in `a028972` (1.491.0). `npx turbo build --force` exits 0 and prints no warning.

**What filled the entry chunk** (620.6 kB, attributed through a source map of the minified chunk): react-dom
176 kB, the desktop's own code 219 (its shared components 80, the Linux windows module 44, the stores 23), Base UI
85 (menus 21, floating-ui hooks 17, the slider 14, the scroll area 11), axios 50, framer-motion and motion-dom 42,
lucide-react 17. The apps and Settings were already lazy, so the parts that could leave were the shell's own.

**Made lazy**, each a chunk fetched when first needed: Start's menu (12.9 kB, fetched when the pointer or focus
reaches the button), the command palette (3.8 kB, on its first opening, then kept mounted so a close is the
dialog's own), the notification list (3.8 kB, when the pointer or focus reaches the bell), the file dialog's picker
(7.2 kB), a Linux window's inside (15.5 kB) and the Linux windows socket's code (12.1 kB, fetched once the desktop
has mounted). Their Base UI pieces (scroll area, checkbox) left with them. `shared/components/lazyPart.tsx` loads
such a part: a chunk that fails shows a notice instead of taking the desktop down, since the shell has no boundary
above it, and is asked for again the next time the part shows. The notifications barrel no longer re-exports the
panel, which kept it in the entry and made the build warn (`INEFFECTIVE_DYNAMIC_IMPORT`).

**Monaco, split by size first, broke, so it stays whole.** A `codeSplitting` group for `monaco-editor` with
`maxSize: 500_000` built clean (51 pieces, none over 228 kB; 47 in a variant that left Monaco's lazily loaded
languages out of the group), but in both, opening the Code Editor crashed with "c is not a constructor": Monaco's
modules import each other in circles, and a piece ran before the piece defining a class it builds. Core's Vite
config sets `build.chunkSizeWarningLimit: 2_800` with a comment naming Monaco, its size and that it loads on demand.
The limit now covers every chunk: the entry could pass 500 kB again without a warning.

| Chunk | Before | After |
|---|---:|---:|
| `index-*.js`, the entry | 620.6 kB (202.9 gzip) | 410.9 kB (132.6 gzip) |
| `editor.api-*.js`, Monaco | 2,735.5 kB (706.1 gzip) | 2,735.5 kB (706.1 gzip) |
| `language-*.js`, the rest of Monaco | 1,312.1 kB (332.6 gzip) | 1,312.1 kB (332.2 gzip) |
| The first load's scripts | 22 files, 814.8 kB (271.9 gzip) | 57 files, 745.8 kB (258.4 gzip) |

`language-*.js` was over 500 kB too; the brief's build log named only the warning. The first load has 35 more
files: Rolldown puts the modules the entry shares with the new lazy parts in common chunks of their own, as it
already did for the ones shared with apps. A `codeSplitting` group over the first load (`tags: ["$initial"]`,
`maxSize: 1_000_000`) made it 6 files and 240 kB gzip with the desktop starting clean, but it is a second split by
size, the mechanism that broke Monaco, and the brief did not ask for it; it is left for a brief of its own.

**Walk.** Not the dev container: Docker's daemon started here but Docker Hub answered 429, so no image could be
built. Instead the production build (`VITE_API_URL=/api`, as the image builds it) was served by the backend with
`STATIC_ROOT`, as the image runs it, on a scratch home, and walked in Chromium (Playwright) at 1366×800 in Apricot
light and Classic dark: the desktop starts; the first load fetches no Monaco, editor, Start, palette, picker or
notifications chunk; Start's chunk arrives on hover and the menu opens; the palette opens with focus in its field
and opens again empty; the notification list opens; the Code Editor opens (11 scripts, `editor.api` and
`language` among them), File → Open… loads the picker, and `math.ts` shows in six token colours with the find
widget in place; the Diff tool compares two files (4 inserted and 2 deleted marks). No failed request, no console
error or warning. With Start's chunk refused once, the desktop stayed, a notice said "Start could not load" and
the next opening loaded it. Not walked: a Linux window, since there is no Wayland host here (the gateway answered
"unavailable"); the socket's code, now lazy, did open the socket on each load.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board was not updated: it was not available in this
session. Owner step: `node cli.ts imbatranim-os server`.
