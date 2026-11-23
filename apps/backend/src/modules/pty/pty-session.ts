import {
  BACKPRESSURE_HIGH_WATER,
  BACKPRESSURE_LOW_WATER,
  BACKPRESSURE_POLL_MS,
  DETACH_MS,
  RING_BYTES,
  MAX_COLS,
  MAX_ROWS,
} from "./pty.constants";

/** Minimal disposable, matching node-pty's IDisposable. */
export interface Disposable {
  dispose(): void;
}

/**
 * The subset of node-pty's `IPty` this session drives. Declaring it
 * structurally lets the lifecycle be unit-tested with a fake pty (no real
 * process spawn required).
 */
export interface PtyLike {
  onData(cb: (data: string) => void): Disposable;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): Disposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  pause(): void;
  resume(): void;
}

/** The subset of `ws`'s WebSocket this session drives. */
export interface SocketLike {
  readonly bufferedAmount: number;
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  /** A WebSocket ping; the peer's pong arrives as a `pong` event. */
  ping?(): void;
  /** Drops the connection without a close handshake, for a peer that stopped answering. */
  terminate?(): void;
}

/** WebSocket.OPEN — inlined so tests need no `ws` import. */
const WS_OPEN = 1;

/** Handle returned by the backpressure poll timer (real or injected fake). */
type TimerHandle = ReturnType<typeof setInterval>;
/** Handle returned by the detach timer (real or injected fake). */
type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * Client → server control frames. Keystrokes travel as `input`; `close` is the tab saying its window's
 * close went ahead, so the socket's end that follows hangs the shell up rather than detaching it.
 */
type ClientMessage =
  { type: "input"; data: string } | { type: "resize"; cols: number; rows: number } | { type: "close" };

/** Full reset (RIS): a tab that reattaches starts from a clean screen, then gets the kept output. */
const RESET = "\x1bc";

export interface PtySessionOptions {
  highWater?: number;
  lowWater?: number;
  pollMs?: number;
  setIntervalFn?: (fn: () => void, ms: number) => TimerHandle;
  clearIntervalFn?: (handle: TimerHandle) => void;
  /**
   * How long the pty waits for a reattach after its socket closes without a `close` frame. Zero or less ends
   * it at once, as a socket with no way back (no shell token) must.
   */
  detachMs?: number;
  /** How much of the latest output the session keeps for a reattach, in characters. */
  ringBytes?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => TimeoutHandle;
  clearTimeoutFn?: (handle: TimeoutHandle) => void;
  /** Called once when the session ends, whatever ended it. */
  onDispose?: () => void;
}

/**
 * Bridges one pty to the socket of the tab showing it, for the pty's whole life.
 *
 *  - pty output  → raw text frames to the socket (xterm writes them verbatim)
 *  - client input → `pty.write`; `resize` → `pty.resize` (SIGWINCH)
 *  - pty exit → a short notice frame, then the socket is closed
 *  - the tab's `close` frame, then its socket's end (the window closed), or an external revoke → the pty is
 *    killed
 *  - a socket that ends WITHOUT the `close` frame (a reload, a dropped network) → the pty is detached: it keeps
 *    running and being read, and after {@link DETACH_MS} with no reattach it is killed. {@link attach} gives it a
 *    new socket: a reset, the last {@link RING_BYTES} of output (kept all along), then live
 *  - backpressure: a stdout flood pauses the pty until the send buffer drains (only while attached; a detached
 *    pty is read into the ring, so a busy command never stalls on a full pty)
 *
 * Every teardown path funnels through {@link dispose}, which is idempotent, so
 * the pty is reaped exactly once no matter which side goes away first.
 */
export class PtySession {
  private readonly highWater: number;
  private readonly lowWater: number;
  private readonly pollMs: number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearIntervalFn: (handle: TimerHandle) => void;

  private readonly detachMs: number;
  private readonly ringBytes: number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => TimeoutHandle;
  private readonly clearTimeoutFn: (handle: TimeoutHandle) => void;
  private readonly onDispose: (() => void) | undefined;

  private readonly disposables: Disposable[] = [];
  private drainTimer: TimerHandle | null = null;
  private paused = false;
  private disposed = false;
  /** The socket showing the pty; null while it is detached. */
  private socket: SocketLike | null = null;
  /** Set by the tab's `close` frame: the socket's end that follows is a closed window, not a drop. */
  private closeMeant = false;
  private detachTimer: TimeoutHandle | null = null;
  /** The latest output, oldest first, at most `ringBytes` characters in all: what a reattaching tab is sent. */
  private ring: string[] = [];
  private ringSize = 0;
  /** Settles the pending {@link probe}: true on the socket's pong, false once the socket is gone. */
  private settleProbe: ((held: boolean) => void) | null = null;

  constructor(
    private readonly pty: PtyLike,
    socket: SocketLike,
    opts: PtySessionOptions = {},
  ) {
    this.highWater = opts.highWater ?? BACKPRESSURE_HIGH_WATER;
    this.lowWater = opts.lowWater ?? BACKPRESSURE_LOW_WATER;
    this.pollMs = opts.pollMs ?? BACKPRESSURE_POLL_MS;
    this.setIntervalFn = opts.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = opts.clearIntervalFn ?? ((h) => clearInterval(h));
    this.detachMs = opts.detachMs ?? DETACH_MS;
    this.ringBytes = opts.ringBytes ?? RING_BYTES;
    this.setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((h) => clearTimeout(h));
    this.onDispose = opts.onDispose;

    this.disposables.push(this.pty.onData((d) => this.onPtyData(d)));
    this.disposables.push(this.pty.onExit((e) => this.onPtyExit(e)));

    this.bind(socket);
  }

  /**
   * Gives a detached pty its tab back: a full reset, the latest output (what the tab showed, and what came while
   * it was away), then live output. The caller resizes the pty to the new tab's size, so a full-screen program
   * redraws. A session that is attached or has ended refuses (returns false) and leaves `socket` to the caller.
   */
  attach(socket: SocketLike): boolean {
    if (this.disposed || this.socket !== null) return false;
    if (this.detachTimer !== null) {
      this.clearTimeoutFn(this.detachTimer);
      this.detachTimer = null;
    }
    this.bind(socket);
    this.safeSend(RESET + this.ring.join(""));
    return true;
  }

  /** Whether a socket is showing the pty now. */
  get attached(): boolean {
    return !this.disposed && this.socket !== null;
  }

  /**
   * Asks the attached socket whether its peer is still there: a ping, and `ms` for the pong. A peer that doesn't
   * answer is a half-open connection (a phone that changed networks leaves one behind, its tab already
   * reconnecting): its socket is dropped and the pty detached, so the tab coming back can {@link attach}.
   * Resolves true while a live tab holds the pty, false once it is free.
   */
  probe(ms: number): Promise<boolean> {
    const socket = this.socket;
    if (this.disposed || socket === null) return Promise.resolve(false);
    if (!socket.ping) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = this.setTimeoutFn(() => {
        // No pong: drop the socket, which detaches the pty and settles the probe.
        try {
          socket.terminate?.();
        } catch {
          /* noop */
        }
        if (this.socket === socket) this.onSocketGone();
        settle(false);
      }, ms);
      const settle = (held: boolean): void => {
        if (this.settleProbe !== settle) return;
        this.settleProbe = null;
        this.clearTimeoutFn(timer);
        resolve(held && this.attached);
      };
      this.settleProbe = settle;
      try {
        socket.ping?.();
      } catch {
        /* the timer answers */
      }
    });
  }

  /** Resizes the pty (SIGWINCH), clamped to the gateway's bounds. */
  resize(cols: number, rows: number): void {
    const c = Math.min(MAX_COLS, Math.max(1, Math.floor(cols)));
    const r = Math.min(MAX_ROWS, Math.max(1, Math.floor(rows)));
    try {
      this.pty.resize(c, r);
    } catch {
      /* ignore resize on a dead pty */
    }
  }

  private bind(socket: SocketLike): void {
    this.socket = socket;
    this.closeMeant = false;
    // Each listener checks it still belongs to the current socket: an old socket's late events must not
    // touch the pty a new tab now shows.
    socket.on("message", (raw: unknown) => {
      if (this.socket === socket) this.onClientMessage(raw);
    });
    socket.on("close", () => {
      if (this.socket === socket) this.onSocketGone();
    });
    socket.on("error", () => {
      if (this.socket === socket) this.onSocketGone();
    });
    socket.on("pong", () => {
      if (this.socket === socket) this.settleProbe?.(true);
    });
  }

  /** The socket ended: a closed window if the tab said so first, otherwise a drop the tab may come back from. */
  private onSocketGone(): void {
    if (this.disposed) return;
    if (this.closeMeant || this.detachMs <= 0) {
      this.dispose();
      return;
    }
    this.socket = null;
    this.settleProbe?.(false);
    this.clearDrainTimer();
    if (this.paused) {
      this.paused = false;
      try {
        this.pty.resume();
      } catch {
        /* pty may have exited */
      }
    }
    this.detachTimer = this.setTimeoutFn(() => this.dispose(1000, "detached-timeout"), this.detachMs);
  }

  // ── pty → socket ───────────────────────────────────────────────────────

  private onPtyData(data: string): void {
    if (this.disposed) return;
    this.keep(data);
    if (this.socket === null) return;
    this.safeSend(data);
    this.applyBackpressure();
  }

  /**
   * Keeps output, dropping the oldest past `ringBytes`. A cut inside a chunk moves on to its next line where it
   * has one, so the replay rarely starts inside an escape sequence.
   */
  private keep(data: string): void {
    this.ring.push(data);
    this.ringSize += data.length;
    while (this.ringSize > this.ringBytes && this.ring.length > 0) {
      const over = this.ringSize - this.ringBytes;
      const first = this.ring[0] ?? "";
      if (first.length <= over) {
        this.ring.shift();
        this.ringSize -= first.length;
      } else {
        const line = first.indexOf("\n", over);
        const cut = line === -1 ? over : line + 1;
        this.ring[0] = first.slice(cut);
        this.ringSize -= cut;
      }
    }
  }

  private onPtyExit(e: { exitCode: number; signal?: number }): void {
    if (this.disposed) return;
    this.safeSend(`\r\n[process exited (code ${e.exitCode})]\r\n`);
    // Close the socket cleanly; dispose() reaps timers/listeners. The pty is
    // already gone, so kill() is a harmless no-op guarded by try/catch.
    this.dispose(1000, "pty-exit");
  }

  /**
   * Pause the pty when the socket's send buffer is congested; poll and resume
   * once it drains. Prevents a `yes`-style flood from ballooning memory.
   */
  private applyBackpressure(): void {
    if (this.paused || this.disposed || this.socket === null) return;
    if (this.socket.bufferedAmount < this.highWater) return;
    this.paused = true;
    try {
      this.pty.pause();
    } catch {
      /* pty may have exited */
    }
    this.drainTimer = this.setIntervalFn(() => this.checkDrain(), this.pollMs);
  }

  private checkDrain(): void {
    if (this.disposed || this.socket === null) return;
    if (this.socket.bufferedAmount > this.lowWater) return;
    this.clearDrainTimer();
    this.paused = false;
    try {
      this.pty.resume();
    } catch {
      /* pty may have exited */
    }
  }

  // ── socket → pty ───────────────────────────────────────────────────────

  private onClientMessage(raw: unknown): void {
    if (this.disposed) return;
    const msg = this.parseMessage(raw);
    if (!msg) return;
    if (msg.type === "input") {
      try {
        this.pty.write(msg.data);
      } catch {
        /* pty may have exited; onExit will tear down */
      }
    } else if (msg.type === "close") {
      this.closeMeant = true;
    } else {
      this.resize(msg.cols, msg.rows);
    }
  }

  /** Parse + validate a client frame; returns null for anything malformed. */
  private parseMessage(raw: unknown): ClientMessage | null {
    let text: string;
    if (typeof raw === "string") text = raw;
    else if (raw instanceof Buffer) text = raw.toString("utf8");
    else if (raw && typeof (raw as { toString?: unknown }).toString === "function") {
      // Catch-all for exotic WS payload shapes (e.g. ArrayBuffer) that are
      // neither `string` nor `Buffer`. `raw` is `unknown` here and its
      // constituents can't be narrowed further without changing which
      // payload shapes this accepts, so a genuinely-custom-toString type
      // can't be expressed. A default `[object X]` stringification just
      // fails the JSON.parse below and the frame is dropped as malformed —
      // same as today.
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      text = String(raw);
    } else return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const msg = parsed as Record<string, unknown>;

    if (msg.type === "input" && typeof msg.data === "string") {
      return { type: "input", data: msg.data };
    }
    if (msg.type === "close") return { type: "close" };
    if (msg.type === "resize" && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
      return {
        type: "resize",
        cols: msg.cols as number,
        rows: msg.rows as number,
      };
    }
    return null;
  }

  // ── teardown ─────────────────────────────────────────────────────────────

  /**
   * Reap everything. Idempotent — safe to call from socket close, pty exit,
   * or an external session-revocation sweep.
   */
  dispose(code = 1000, reason = "closed"): void {
    if (this.disposed) return;
    this.disposed = true;

    this.clearDrainTimer();
    this.settleProbe?.(false);
    if (this.detachTimer !== null) {
      this.clearTimeoutFn(this.detachTimer);
      this.detachTimer = null;
    }
    this.ring = [];
    this.ringSize = 0;
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* noop */
      }
    }
    try {
      this.pty.kill();
    } catch {
      /* already dead */
    }
    try {
      if (this.socket?.readyState === WS_OPEN) this.socket.close(code, reason);
    } catch {
      /* noop */
    }
    this.onDispose?.();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  private safeSend(data: string): void {
    if (this.socket?.readyState !== WS_OPEN) return;
    try {
      this.socket.send(data);
    } catch {
      /* socket went away between the readyState check and send */
    }
  }

  private clearDrainTimer(): void {
    if (this.drainTimer !== null) {
      this.clearIntervalFn(this.drainTimer);
      this.drainTimer = null;
    }
  }
}
