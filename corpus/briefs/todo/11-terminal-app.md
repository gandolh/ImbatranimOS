# Task 11 — Terminal app: real PTY in a window

## Context

The soul of "B: real OS, browser = screen" (decisions). A window in the
desktop containing a real shell on the container, as `imbatranim`, over an
authenticated WebSocket. Depends on 08 (desktop), 09 (user exists), 10
(auth gates the socket).

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
