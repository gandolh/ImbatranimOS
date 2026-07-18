# Brief 42 — Git GUI

Status: **todo** · Promotes [git-gui-addon](../../todos/git-gui-addon.md). Wave D.
**HARD → senior/opus.** New **backend** module `apps/backend/src/modules/git/` +
new frontend package `apps/add-ons/git-gui/`. **Security-reviewed before commit.**

## Problem

No way to run git from the desktop. Devs want status/stage/commit/diff/log for a
repo in their home FS, authed like everything else, without dropping to the
terminal.

## Decisions (grilled 2026-07-18)

- **Backend runs real `git` via `execa` with ARRAY args — never a shell string.**
  execa (already a backend dep) with `execa('git', [subcommand, ...args], {
  cwd })` gives no shell interpolation, so a branch name / commit message / path
  can't inject a command. **Never** build a command string; **never** pass
  `shell: true`.
- **Fixed subcommand allowlist.** Only these git operations exist as endpoints —
  there is NO passthrough of arbitrary git args from the client:
  `status`, `log`, `diff` (read); `add` (stage), `reset` (unstage), `commit`
  (write). push/pull/remote/checkout/clone are **out of scope** (later brief) —
  do not add a generic "run git" route.
- **Repo path is jailed.** The repo directory is a home-FS path resolved through
  the existing `FilesService.resolveSafe(root, path)` (reuse it — inject
  `FilesService`, do NOT reimplement the jail). `cwd` is the jailed absolute dir.
  Reject if the resolved dir is not a git work-tree (`git rev-parse
  --is-inside-work-tree`). Everything runs as the unprivileged `imbatranim` user
  (the process user) — no sudo, no privileged ops.
- **Authed by default** — the global `SessionAuthGuard` covers every route; no
  `@Public()` here. Mutating routes get the same Origin/CSRF check for free.
- **Bounded + safe output.** Per-call timeout (execa `timeout`), a max output
  buffer (execa `maxBuffer`) so a huge diff/log can't OOM, and `--no-pager`
  / `-c core.pager=cat` so git never blocks on a pager. Commit author/committer
  come from repo/global git config or a fixed identity — never from unsanitized
  client input beyond the message + selected paths (both passed as array args).
- **Scope: one repo at a time** (the path the user points at). No multi-repo
  dashboard.

## Fix

**Backend** `apps/backend/src/modules/git/`: `git.module.ts` (imports
`FilesModule` to reuse `FilesService`), `git.controller.ts` (`@Controller('git')`,
routes below), `git.service.ts` (execa calls + work-tree check + output parse),
`dto/git.dto.ts` (class-validator DTOs: `root`, `path`, plus `message`,
`paths[]` for the write routes). Routes:
- `GET  /api/git/status?root=&path=` → parsed porcelain status
- `GET  /api/git/log?root=&path=&limit=` → recent commits
- `GET  /api/git/diff?root=&path=&staged=&file=` → unified diff (bounded)
- `POST /api/git/stage`   { root, path, paths[] }  (`git add -- <paths>`)
- `POST /api/git/unstage` { root, path, paths[] }  (`git reset -- <paths>`)
- `POST /api/git/commit`  { root, path, message }  (`git commit -m <message>`)
Register `GitModule` in `apps/backend/src/app.module.ts` (controller edit).
Add jest unit tests for the service (path jail rejects non-repo/escape; args are
arrays; parse of status/log) mirroring the existing backend test style; keep
`backend#test` + `backend#lint` green.

**Frontend** `apps/add-ons/git-gui/`: add-on scaffold; `src/index.ts` manifest
(`icon: GitBranch`, lazy, `multiInstance: false`), `src/GitGui.tsx` (pick a repo
path, status list with stage/unstage checkboxes, a diff pane, a commit box + log
list) calling the routes via core `api`. Deps: `@imbatranim/core` + `lucide-react`.

## Must preserve (regression surface)

- **No command injection**: array args only, no `shell: true`, message/paths/
  branch never concatenated into a command string. The security review will try
  to break this.
- **No jail escape**: repo dir via `resolveSafe`; `cwd` never a client-controlled
  absolute path; `--` separates options from pathspecs so a path starting with
  `-` can't be read as a flag.
- Auth on every route (global guard); no new public route.
- Backend tests + lint stay green (80 unit + e2e today).

## Verify bar

`turbo typecheck`, backend + git-gui lint/format green, `backend#test` green
(new tests included), `turbo build` ok. **Adversarial security review** (git
arg injection, jail escape via crafted path/pathspec, `-`-leading path, symlink,
output OOM, missing-repo handling) — findings fixed before commit. **Human-gated:**
point it at a real repo, stage/unstage/commit/diff/log all work.

## Invariants

Unprivileged `imbatranim`, no sudo, jailed FS, auth everywhere — all locked
invariants, load-bearing here. Lightweight: no new dependency (execa present).
`git` binary is in the image (build-from-source distribution — confirm it's
installed; if not, that's an image/Dockerfile note, not a client hack).

## Out of scope

push/pull/fetch/remote/clone/checkout/branch/merge/rebase, credential handling,
multi-repo, submodules, a generic "run any git command" route (explicitly
forbidden — injection surface).

## Outcome (2026-07-18) — Wave D commit `4be1777`

Shipped. Backend `apps/backend/src/modules/git/` (registered in app.module.ts by
the controller): all git runs through one `execa('git', string[], { shell:false,
cwd, timeout:15s, maxBuffer:10MB })` seam — no shell, array args only, `--`
before every pathspec, `GIT_LITERAL_PATHSPECS=1`, fixed subcommand allowlist
(status/log/diff/add/reset/commit). `cwd` only from `FilesService.resolveSafe`;
work-tree gate + (hardening) `--show-toplevel`-within-jail check. Authed by the
global guard. Frontend `apps/add-ons/git-gui/` (repo picker, status + stage/
unstage, diff pane, commit box + log). 20 unit tests. **Security review: no
exploitable finding**; the LOW ancestor-`.git` gap was closed with the
top-level-in-jail assertion (test-mock updated). Commit-runs-hooks confirmed not
an escalation (user already has a PTY shell). No new dep (execa present). git
binary must be in the image (present: 2.34.1). `multiInstance: false`.
Human-gated: point at a real repo, stage/commit/diff/log.
