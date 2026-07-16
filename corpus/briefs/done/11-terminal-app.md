# Task 11 — Terminal app: real PTY in a window

## Context

The soul of "B: real OS, browser = screen" (decisions). A window in the
desktop containing a real shell on the container, as `imbatranim`, over an
authenticated WebSocket. Depends on 08 (desktop), 09 (user exists), 10
(auth gates the socket).

**Seed from brief 08 (verified):** the fork already ships `node-pty`, an
xterm frontend (`repl-interpreter` module), and a backend `repl` module —
BUT the repl module is an HTTP request/response command-runner over
predefined "configs" (`POST /repl/sessions/:id/input`), NOT a live
interactive TTY. There is no WebSocket, no output streaming, no resize.
So this brief is real work, not a wrap-and-reskin: reuse node-pty + the
xterm UI, but REPLACE the HTTP transport with a streaming WebSocket PTY
bridge (spawn/data/resize/kill). Treat `repl-interpreter` as the app shell
to evolve, and decide whether the config-based `repl` module survives
alongside a true terminal or is absorbed by it.

## Files you OWN

- Backend PTY gateway (node-pty; WS endpoint; spawn/resize/kill; session
  ownership)
- Frontend Terminal app (xterm.js in the fork's window framework: open,
  resize, close, multiple instances)

## What to do

1. node-pty spawning the login shell as the container user; bidirectional
   WS bridge; SIGWINCH on window resize; kill PTY on socket close/window
   close.
2. xterm.js wired to the fork's window manager — draggable window,
   multiple terminals, each its own PTY.
3. Authenticated upgrade only (brief 10's session check); PTYs die with
   the session.
4. Sane scrollback cap and flow control (xterm.js + WS backpressure) so a
   `yes` flood doesn't kill the tab.

## Acceptance

Open Terminal from the start surface → real prompt as imbatranim; `ls`,
`top`, `vi` work; resizing the window resizes the TTY; two terminal
windows are two independent shells; closing the window reaps the process;
unauthenticated WS connection attempts are refused.

---

**Outcome (2026-07-17):** DONE. New backend `pty` module — `ws` WebSocket
server attached via HttpAdapterHost (no main.ts change) at `/api/pty`,
session-cookie auth on upgrade (401), node-pty login shell, resize,
backpressure (pause ≥1MiB / resume <256KiB), 30s session-revocation sweep.
Old config-based `repl` module DELETED (absorbed — its `repl_configs`
table drop is deferred to brief 15). Frontend: `Terminal.tsx` (xterm +
fit, 5000-line scrollback) in the repl-interpreter dir; registry entry now
`terminal`, multiInstance. 17 new unit + 3 e2e tests.
