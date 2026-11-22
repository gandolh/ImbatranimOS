import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import { buildPtyUrl } from "../ptyUrl";
import { classifyClose, MAX_RETRIES, retryDelay } from "../lib/closeReason";

export type PtyStatus =
  | { kind: "connecting" }
  | { kind: "open" }
  /** Waiting out a backoff delay before attempt `attempt` of MAX_RETRIES. */
  | { kind: "retrying"; attempt: number; message: string }
  /** Gave up automatically, or hit a settled end state. `canRetry` drives the button. */
  | { kind: "closed"; message: string; canRetry: boolean };

type UsePtyConnectionArgs = {
  /**
   * Reads the live xterm instance, or null before it exists.
   *
   * A getter rather than the instance itself because the instance is a mutable
   * external object held in a ref, not render data. Passing it through render would
   * mean reading a ref during render, and would stop the caller mutating
   * `term.options` — xterm's only API for theme and font size.
   *
   * **Must be stable.** See the effect's dependency note.
   */
  getTerm: () => XTerm | null;
  /**
   * Bumped by the caller once the terminal exists. This — not the instance — is
   * what tells the effect below there is something to connect to, and it is the
   * effect's only dependency.
   */
  generation: number;
  /**
   * Where the window keeps its shell's token across a reload: `system.window`'s
   * `savedState` and `saveState`. Absent (an older desktop, a windowless mount),
   * the token lasts as long as this mount.
   */
  keep?: ShellTokenKeep;
};

/** The window's saved state, as the hook uses it: the token of its shell. */
export type ShellTokenKeep = {
  saved(): string | null;
  save(token: string | null): void;
};

/** A new name for this window's shell. */
function newToken(): string {
  return crypto.randomUUID();
}

/** How the server's first frame after a reattach starts: a full reset (RIS), then the replayed output. */
const REPLAY = "\x1bc";

/**
 * Owns the PTY socket: connect, stream, classify a close, reconnect with backoff,
 * and tear down exactly once.
 *
 * Extracted from `Terminal.tsx`'s mount effect, which was doing five jobs at once
 * and had no room for retry logic — the reason a dropped socket used to kill the
 * window permanently.
 *
 * ## Reconnecting gives you the SAME shell, while it waits
 *
 * The window names its shell with a token it keeps across a reload (`keep`). The
 * first socket starts the shell (`shell=<token>`); every later one, a reconnect
 * after a drop or the first socket after a reload, comes back to it
 * (`resume=<token>`). A socket that ends without the window closing leaves the
 * shell detached on the server for 30 s, still running, so a reload or a short drop
 * finds it there: the server resets the screen, replays its last 256 KiB of output
 * and resizes the pty, so a full-screen program redraws. After 30 s, or once the
 * shell exited, the server starts a new one and says so in a dim line.
 *
 * Closing the window is the one end the server must hear about: {@link sendClose}
 * sends `{"type":"close"}` from the window's close guard, and the shell ends at
 * once. React's unmount is not the signal, since a per-window error boundary's reset
 * unmounts too, and the remount comes back to the same shell.
 *
 * A duplicated tab copies the window's token. The server refuses a shell another
 * live socket holds with 4409, and this window takes a token of its own.
 *
 * ## Everything lives in one effect, deliberately
 *
 * The socket, the retry counter, the backoff timer and the pending-input queue are
 * plain locals inside a single effect, and the outward-facing functions are thin
 * wrappers over a ref holding that effect's closure.
 *
 * An earlier draft spread them across `useCallback`s with mirror refs. That needed a
 * self-referencing callback for the retry (`connect` scheduling `connect`) and
 * mirror refs for the arguments, and React's lint rules rejected both — a
 * `useCallback` may not name itself, and a hook-produced value may not be copied
 * into a ref. A recursive local function inside one effect is the shape this
 * actually is, and it needs neither.
 */
export function usePtyConnection({ getTerm, generation, keep }: UsePtyConnectionArgs) {
  const [status, setStatus] = useState<PtyStatus>({ kind: "connecting" });

  /**
   * The live connection's own operations, published by the effect below.
   *
   * Null between teardown and the next connect, which is why every wrapper below is
   * optional-chained rather than asserting.
   */
  const apiRef = useRef<{
    sendInput: (data: string) => void;
    sendResize: (cols: number, rows: number) => void;
    sendClose: () => void;
    reconnect: () => void;
  } | null>(null);

  useEffect(() => {
    if (generation <= 0) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    /** Frames typed before the socket is open, flushed on connect. */
    let pending: string[] = [];
    /** The window's shell, and whether the next socket comes back to it rather than starting it. */
    const kept = keep?.saved() ?? null;
    let token = kept ?? newToken();
    let resume = kept !== null;
    if (kept === null) keep?.save(token);
    /**
     * True while the replay is being written. The replayed output holds the queries the shell sent (a
     * cursor-position request in each prompt), and xterm answers them as it writes. Those answers were given
     * when the output first came; sent again they would reach the running program as typing.
     */
    let replaying = false;

    const write = (data: string | Uint8Array) => getTerm()?.write(data);
    /** Dim status line inside the terminal, so it scrolls with the history. */
    const writeStatus = (text: string) => write(`\r\n\x1b[2m${text}\x1b[0m\r\n`);

    const sendFrame = (frame: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(frame);
      // Buffered rather than dropped: typing during a reconnect must not be
      // silently swallowed. The original code did this for the pre-open window and
      // the behaviour has to survive here.
      else pending.push(frame);
    };

    const sendResize = (cols: number, rows: number) => {
      // Unlike input there is no value in replaying a stale geometry — a reconnect
      // sends the current size itself — so this is dropped rather than queued.
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    };

    /**
     * Ask the API who we are, to explain a handshake refusal accurately.
     *
     * Needed because an unauthorized upgrade is rejected with a raw 401 and
     * `socket.destroy()`, which reaches script as an anonymous 1006 — exactly what
     * a dead backend produces. Without this the terminal would say "disconnected"
     * when the truth is "you are signed out".
     *
     * Probes `/me`, the desktop's own session read, whose status
     * codes are the answer: 200 means the session is fine and the refusal was
     * something else; 401 is signed out; 403 is signed in without a grant.
     */
    const describeAuthFailure = async (): Promise<string | null> => {
      try {
        const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
        const res = await fetch(`${base}/me`, { credentials: "include" });
        if (res.ok) return null;
        if (res.status === 401) return "Signed out — sign in again from the desktop.";
        if (res.status === 403) return "This account has no access to this system.";
        return "The backend is not reachable.";
      } catch {
        // The API is unreachable too, which is its own answer.
        return "The backend is not reachable.";
      }
    };

    function connect() {
      const term = getTerm();
      if (disposed || !term) return;

      setStatus({ kind: "connecting" });
      let everOpened = false;

      const ws = new WebSocket(buildPtyUrl(term.cols, term.rows, { token, resume }));
      socket = ws;

      ws.onopen = () => {
        everOpened = true;
        attempt = 0;
        // The shell exists now; every later socket of this window comes back to it.
        resume = true;
        setStatus({ kind: "open" });
        for (const frame of pending) ws.send(frame);
        pending = [];
        // Re-assert the geometry: the pty spawned at the URL's cols/rows, but the
        // window may have been resized while disconnected, and `stty size` has to
        // agree with what xterm is showing after a reconnect.
        const live = getTerm();
        if (live) sendResize(live.cols, live.rows);
      };

      let first = true;
      ws.onmessage = (ev) => {
        const data = typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data as ArrayBuffer);
        const replay = first && typeof data === "string" && data.startsWith(REPLAY);
        first = false;
        if (!replay) {
          write(data);
          return;
        }
        const live = getTerm();
        if (!live) return;
        replaying = true;
        live.write(data, () => {
          replaying = false;
        });
      };

      ws.onclose = (ev) => {
        if (disposed) return;
        socket = null;
        const verdict = classifyClose(ev.code, ev.reason ?? "", everOpened);

        if (verdict.newShell) {
          token = newToken();
          resume = false;
          keep?.save(token);
          writeStatus(verdict.message);
          connect();
          return;
        }

        if (!verdict.retry) {
          writeStatus(verdict.message);
          setStatus({
            kind: "closed",
            message: verdict.message,
            canRetry: verdict.allowManualRetry,
          });
          return;
        }

        attempt += 1;
        if (attempt > MAX_RETRIES) {
          const give = `${verdict.message} Giving up after ${MAX_RETRIES} attempts.`;
          writeStatus(give);
          setStatus({ kind: "closed", message: give, canRetry: true });
          // Resolve the real cause now that automatic recovery has failed, so the
          // message names the problem instead of guessing at it.
          if (verdict.checkAuth) {
            void describeAuthFailure().then((detail) => {
              if (!detail || disposed) return;
              writeStatus(detail);
              setStatus({ kind: "closed", message: detail, canRetry: true });
            });
          }
          return;
        }

        const delay = retryDelay(attempt);
        writeStatus(`${verdict.message} reconnecting in ${Math.round(delay / 1000)}s…`);
        setStatus({ kind: "retrying", attempt, message: verdict.message });
        timer = setTimeout(() => {
          timer = null;
          connect();
        }, delay);
      };

      // `onerror` fires immediately before `onclose` for a refused handshake.
      // Writing here too would print two lines for one failure, so the close
      // handler owns all user-facing reporting.
      ws.onerror = () => {};
    }

    const reconnect = () => {
      if (disposed) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // A manual retry is the user saying "try now", so the automatic budget starts
      // over rather than the click being spent on the last remaining attempt.
      attempt = 0;
      const existing = socket;
      socket = null;
      try {
        existing?.close();
      } catch {
        /* already gone */
      }
      // The server says when this is a new shell: the old one had ended.
      writeStatus("reconnecting…");
      connect();
    };

    /** The window is closing: the shell ends with it rather than waiting for a reload. */
    const sendClose = () => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "close" }));
    };

    apiRef.current = {
      sendInput: (data) => {
        if (!replaying) sendFrame(JSON.stringify({ type: "input", data }));
      },
      sendResize,
      sendClose,
      reconnect,
    };
    connect();

    return () => {
      disposed = true;
      apiRef.current = null;
      if (timer) clearTimeout(timer);
      timer = null;
      const ws = socket;
      socket = null;
      // Without the close frame the server keeps the shell for 30 s: a closing
      // window sent it already (`sendClose`), and an error boundary's remount comes
      // back to the shell.
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
    // `generation` ONLY. `getTerm` is contractually stable (the caller wraps it in
    // useCallback), and adding it would mean any caller slip re-runs this effect —
    // which tears down a live shell and loses the user's session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  // Stable wrappers, so consumers can put these in their own dependency arrays
  // without re-subscribing every render.
  const sendInput = useCallback((data: string) => apiRef.current?.sendInput(data), []);
  const sendResize = useCallback((cols: number, rows: number) => apiRef.current?.sendResize(cols, rows), []);
  const reconnect = useCallback(() => apiRef.current?.reconnect(), []);
  const sendClose = useCallback(() => apiRef.current?.sendClose(), []);

  return { status, sendInput, sendResize, sendClose, reconnect };
}
