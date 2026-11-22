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

## Outcome (2026-11-22)

Built in `ecc59ea` (1.393.0). **Kit commit for imbatranim-apps' next kit sync: `ecc59ea`** (the optional
`system.window.saveState` / `savedState` pair; `SHARED_KIT_VERSION` and `PROTOCOL_VERSION` don't move).

- **Backend.** `PtySession` binds to one socket at a time. The `{"type":"close"}` frame, then the socket's
  end, kills the pty; a socket that ends without it (or errors) detaches it, and after `DETACH_MS` (30 s)
  with no `attach` the pty is hung up. `attach` sends a full reset (`ESC c`), the ring, then live output;
  the gateway resizes the pty to the new tab's size. A socket that names no shell (no token) ends its shell
  with it, as before. The registry is in `pty.gateway.ts` (a `byKey` map beside the `live` set), keyed by
  the sign-in's `sid`, the desktop session id and the token: `shell=<t>` starts a shell, `resume=<t>` comes
  back to one, and a `resume` that finds nothing starts a new shell with a dim line. The cap counts
  detached shells and a resume to one skips it; the sweep and shutdown end detached shells too.
- **Kit and desktop.** `saveState(value | null)` and `savedState()` are optional on `SystemWindow`; the
  window store keeps `savedState` with the persisted layout (refuses over 512 characters, keeping the old
  value); the windowless handle warns and returns null.
- **Terminal.** `usePtyConnection` reads the token at connect (or makes one and saves it), sends `shell=`
  the first time and `resume=` after that, and on 4409 takes a new token at once. The window's close guard
  sends the close frame and lets the close go ahead. A manual reconnect no longer says it starts a new
  shell; the server says so when it does.

**Not as the brief said, and why:**

- **The ring is kept all along, not only while detached.** Kept only while detached, a reloaded window
  would come back to an empty screen, holding just what printed during the second it was away. The last
  256 KiB of output (about 3,000 lines, under xterm's 5,000-line scrollback) is what the tab gets on
  reattach, so the reload shows its screen. Twelve shells at most is 3 MiB.
- **The server writes the "previous shell ended" line**, since it is the one that knows; the tab writes
  the 4409 one.
- **A held shell is pinged before 4409.** A phone that changes networks leaves a half-open socket behind
  while its tab reconnects; refusing on it would cost the tab its shell. The gateway pings the held socket
  and waits `RESUME_PROBE_MS` (2 s): a pong means another tab (4409), none means the old socket is dropped
  and the shell is handed over. A socket that closes during the wait settles it at once.
- **The tab sends none of xterm's answers while it writes the replay.** BusyBox ash asks for the cursor
  position in every prompt; replayed, those queries got answered again, and the answers reached the
  running `sleep` as typing (`^[[1;5R` on the walk's first screenshot). The first frame after a resume that
  starts with the reset is written with input muted until xterm has parsed it.

**Specs first.** The session spec (fake time) and the gateway spec (real shells) were run against the old
`pty-session.ts` and `pty.gateway.ts`: 15 failed. Now 55 pass in the pty folder, among them: a socket closed
without `close` keeps the pty for 30 s, a resume gets the same pid, a held shell gets 4409, revocation ends
a detached shell, the cap counts detached shells, and a shell is found only from its own tab.

**The walk ran outside Docker** (the daemon is down in this session): the backend and Vite on the host,
BusyBox ash as `sh`, at 1280 in Apricot light. `sleep 600; echo done`, then a reload: the window came back to
the same pid with the command on screen and `sleep` still its child. A duplicated tab (a second page started
with a copy of the first's `sessionStorage`) got its own shell and the line "This shell is open in another
tab; starting a new one."; the first stayed on its shell. Closing the window: the shell's pid was gone
within 1.5 s. Playwright's offline mode doesn't close an open WebSocket, so the 10 s offline step proved
nothing either way; a real drop (`ss -K` on the proxy's connections to the backend, under a loop printing a
tick a second) reattached to the same pid with the ticks counted on through it. The dev-container walk is the
owner's, with the deploy.

`npm run check` exit 0 (one run timed out the marketplace e2e and one the D-Bus integration spec under
load; both pass alone and on the rerun); `bash corpus/lint.sh` OK. brief-board isn't installed in this
session, so the `ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server`.
