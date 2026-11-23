# Brief 112: The Wayland host gets its own agent rules

**Depends on:** 101 (the measuring recipe it links). **Runs after:** 111.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md)
("Habits for every repo").

## Context

- Ghostty keeps an AGENTS.md in ten folders (its benchmarks, compression,
  snapshots, the inspector, fuzzing). Each gives that folder's trade-off
  priorities in order, its targeted test command, how to verify a change and
  how to benchmark it.
- This repo does the same for the web workspaces and the backend in
  `.claude/rules/` (`web.md`, `backend.md`, each scoped by `paths:`).
  `apps/wayland-host` has none, and the root CLAUDE.md says no check here
  touches it. What a builder needs is spread across `PROTOCOL.md`, the
  decisions pages and three research pages.

## Decisions

1. **`.claude/rules/wayland-host.md`**, scoped to `apps/wayland-host/**`,
   short (under 40 lines), in the style of `web.md`:
   - the commands: how the host builds and tests (the Rust builder image, not
     the laptop's toolchain), and the one dev container to reuse;
   - **priorities in order** for a trade-off, taken from the decisions pages
     and confirmed there: the owner's input reaches the app without waiting;
     text and UI stay lossless; host CPU under one CPU; bytes on the link;
   - the protocol rule: `PROTOCOL.md`, `src/protocol.rs`, the backend's
     `wayland.protocol.ts` and `protocol-fixtures/` change together;
   - measuring: brief 101's recipe, the pass bar written first, "measured,
     not built" is a valid end;
   - the traps already paid for: `pkill -f` kills the calling shell; a
     window zoom beside a Linux window crashed Chromium's renderer.
2. No content duplicated from the decisions pages beyond one line each; link
   them.

## Files you OWN

- `.claude/rules/wayland-host.md` (new).
- Corpus: `wiki/status.md` (append to a line), `log.md`.

## What to do

1. Read the decisions pages for the Linux apps, `PROTOCOL.md`, the three
   research pages and brief 101's recipe; write the file.
2. Check that Claude Code loads it: open a file under `apps/wayland-host/src/`
   in a fresh session and see the rule listed.

## Acceptance

- [ ] The rule file exists, is scoped, and every claim in it points at its
  source.
- [ ] `bash corpus/lint.sh` OK.
- [ ] End move `done`.

## Outcome (2026-11-23)

Written in `3af582f` (1.412.0): `.claude/rules/wayland-host.md`, 40 lines with its frontmatter, scoped to
`apps/wayland-host/**` as `web.md` and `backend.md` are scoped.

- **Commands.** The test command runs `cargo test --locked` in `rust:1.97-alpine` with the Dockerfile's
  `wayland-host` stage packages and `RUSTFLAGS`, so it is the image's build, not a laptop's (the stage copies
  no `tests/`, so it mounts the folder instead). The dev container is `infrastructure-dev-1`; compose watch
  rebuilds its image on a change under `apps/wayland-host`, and the backend starts the host from
  `WAYLAND_HOST_BIN`.
- **Priorities.** No page states an order, so the rule says the order is this brief's and gives each line its
  source: input never waits on the link (research-native-apps-via-wayland.md §2, the phone-link row), text and
  UI lossless with only video lossy (brief 36), host CPU under production's one CPU (how-we-measure.md rule 7),
  then bytes (research-video-in-linux-windows.md).
- **Also**: the protocol's four places and `UPDATE_FIXTURES=1`, brief 101's recipe, "only the owner raises
  windows" (brief 110), the vendored smithay's README, and three traps: `pkill -f` kills its caller (this
  brief's own note; no page held it), the zoom crash beside a Linux window (decisions-linux-apps-built.md), and a
  Unix socket path's ~108-byte limit (met in brief 110's walk).

**Not checked as the brief said:** Claude Code reads `.claude/rules/` when a session starts, and this file was
written mid-session, so reading `apps/wayland-host/src/stubs.rs` here didn't list it. Opening a file under
`apps/wayland-host/src/` in a fresh session is the owner's check.

`bash corpus/lint.sh` OK. End move `done`.
