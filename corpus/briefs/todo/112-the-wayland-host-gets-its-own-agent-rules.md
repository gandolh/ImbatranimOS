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
