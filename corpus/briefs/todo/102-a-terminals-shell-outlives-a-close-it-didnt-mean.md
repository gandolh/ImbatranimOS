# Brief 102: A Terminal's shell outlives a close it didn't mean

**Depends on:** nothing. **Runs after:** 101.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20. The call is in
[decisions-terminal.md](../../wiki/decisions-terminal.md) (revisits the
2026-08-06 reattach deferral); research item 2 in
[research-ghostty.md](../../wiki/research-ghostty.md).

## Context

- `apps/backend/src/modules/pty/pty-session.ts` kills the pty when its socket
  closes, for any reason. `buildPtyUrl` (`apps/add-ons/repl-interpreter/src/ptyUrl.ts`)
  sends the size and the tab's desktop session id, nothing that names a
  shell. So `usePtyConnection`'s reconnect after a dropped socket gets a new
  shell, and a reload brings the Terminal window back (the layout is in
  `sessionStorage`) with a fresh prompt and the running command gone.
- Window ids aren't kept across a reload: `PersistedWindow`
  (`apps/core/src/shared/store/windowStore.ts`) holds a `linux?` key for
  Linux windows and nothing an add-on can use.
- A duplicated tab copies `sessionStorage`. The Wayland session refuses the
  second use of a desktop session id and the tab renews its id
  (`packages/ui/src/lib/desktopSession.ts`).
- The gateway caps live shells at `MAX_SESSIONS` and a sweep ends shells whose
  sign-in was revoked (`pty.gateway.ts`, `sweepRevoked`).

## Decisions

From decisions-terminal.md, plus technical calls by convention:

1. **A window keeps a token across a reload.** A small kit addition:
   `system.window.saveState(value: string | null)` and
   `system.window.savedState(): string | null`, stored with the window's
   persisted layout (per tab, at most 512 characters). It is the shape of
   macOS state restoration and Android's saved instance state, and other apps
   can use it later. Both members are optional additions, not a breaking
   change: neither `SHARED_KIT_VERSION` (as with brief 96's `closeOnClick`)
   nor `PROTOCOL_VERSION` ("bump on any breaking change", `system.ts`) moves,
   and a caller checks the member exists.
2. **The tab says when it means to close.** When the window's close goes
   ahead (through `system.window.onCloseRequest`, after any question brief 106
   adds), the Terminal sends `{"type":"close"}` before the socket closes. Not
   from React's unmount: that also runs when a per-window error boundary
   resets. The idle cover and sign-out keep the desktop mounted (`AuthGate.tsx`
   hides it with `visibility: hidden`), so they close nothing. A socket that
   closes without the frame (a reload, a drop, a backgrounded phone tab, a
   close path that skips the guard) detaches its pty for 30 s instead of
   killing it.
3. **Reattach.** The PTY URL carries `resume=<token>`. The gateway looks the
   pty up by the desktop session id, the token and the signed-in session, and
   attaches the new socket. Unknown or expired: a new shell, and the tab
   writes a dim line saying the previous shell ended. Already attached to an
   open socket (a duplicated tab): refused with close code 4409, the tab drops
   its token and starts a new shell.
4. **While detached** the pty keeps being read into a ring buffer of its last
   256 KiB, so a busy command doesn't stall on a full pty. On reattach the tab
   resets its xterm, the ring is written, and the pty gets a resize to the
   tab's size (SIGWINCH), so full-screen programs redraw. Brief 103 measures
   whether an exact screen restore beats this.
5. **Lifetimes.** A detached pty counts toward `MAX_SESSIONS`; sign-out, the
   revocation sweep and the 30 s timer end it with the same hang-up as today.
   The idle cover screen doesn't touch it.

## Files you OWN

- `apps/backend/src/modules/pty/`: the gateway, the session, the constants,
  a new detached-session registry, and their specs.
- `apps/add-ons/repl-interpreter/src/`: `ptyUrl.ts`, `hooks/usePtyConnection.ts`,
  `Terminal.tsx`, `lib/closeReason.ts`, their tests.
- `packages/ui/src/system.ts` and `apps/core/src/system/createSystemHandle.ts`
  (both handles; the windowless one warns), `windowStore.ts` for the persisted
  field, their tests.
- Corpus: `wiki/architecture.md` (the Terminal's lifecycle line),
  `docs/architecture.md` where the Terminal is described, `wiki/status.md`
  (append to a line), `log.md`.

## What to do

1. Specs first, each failing on today's code: a socket closed without
   `close` keeps the pty for 30 s of fake time; a reconnect with the token
   gets the same pid; a second socket with an attached token gets 4409;
   revocation ends a detached pty; the cap counts detached ptys.
2. The kit addition, the registry, the hook's resume and close frame.
3. Walk it in the dev container: start `sleep 600; echo done` and reload the
   tab, the window comes back to the same shell; turn the network off in
   DevTools for 10 s and on again, same shell; close the window, `ps` shows
   the shell gone; duplicate the tab, the copy gets a new shell. Shots, read.

## Acceptance

- [ ] A reload or a drop under 30 s keeps the shell and its running command;
  closing the window ends it at once.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`;
  the outcome note names the kit commit for imbatranim-apps' next kit sync.
