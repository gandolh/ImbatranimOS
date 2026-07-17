import {
  BACKPRESSURE_HIGH_WATER,
  BACKPRESSURE_LOW_WATER,
  BACKPRESSURE_POLL_MS,
  MAX_COLS,
  MAX_ROWS,
} from './pty.constants';

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
  on(event: string, cb: (...args: any[]) => void): void;
}

/** WebSocket.OPEN — inlined so tests need no `ws` import. */
const WS_OPEN = 1;

/** Handle returned by the backpressure poll timer (real or injected fake). */
type TimerHandle = ReturnType<typeof setInterval>;

/** Client → server control frames. Keystrokes travel as `input`. */
type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number };

export interface PtySessionOptions {
  highWater?: number;
  lowWater?: number;
  pollMs?: number;
  setIntervalFn?: (fn: () => void, ms: number) => TimerHandle;
  clearIntervalFn?: (handle: TimerHandle) => void;
}

/**
 * Bridges one pty to one WebSocket for its whole life.
 *
 *  - pty output  → raw text frames to the socket (xterm writes them verbatim)
 *  - client input → `pty.write`; `resize` → `pty.resize` (SIGWINCH)
 *  - pty exit → a short notice frame, then the socket is closed
 *  - socket close (window closed) OR external revoke → the pty is killed
 *  - backpressure: a stdout flood pauses the pty until the send buffer drains
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

  private readonly disposables: Disposable[] = [];
  private drainTimer: TimerHandle | null = null;
  private paused = false;
  private disposed = false;

  constructor(
    private readonly pty: PtyLike,
    private readonly socket: SocketLike,
    opts: PtySessionOptions = {},
  ) {
    this.highWater = opts.highWater ?? BACKPRESSURE_HIGH_WATER;
    this.lowWater = opts.lowWater ?? BACKPRESSURE_LOW_WATER;
    this.pollMs = opts.pollMs ?? BACKPRESSURE_POLL_MS;
    this.setIntervalFn =
      opts.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = opts.clearIntervalFn ?? ((h) => clearInterval(h));

    this.disposables.push(this.pty.onData((d) => this.onPtyData(d)));
    this.disposables.push(this.pty.onExit((e) => this.onPtyExit(e)));

    this.socket.on('message', (raw: unknown) => this.onClientMessage(raw));
    this.socket.on('close', () => this.dispose());
    this.socket.on('error', () => this.dispose());
  }

  // ── pty → socket ───────────────────────────────────────────────────────

  private onPtyData(data: string): void {
    if (this.disposed) return;
    this.safeSend(data);
    this.applyBackpressure();
  }

  private onPtyExit(e: { exitCode: number; signal?: number }): void {
    if (this.disposed) return;
    this.safeSend(`\r\n[process exited (code ${e.exitCode})]\r\n`);
    // Close the socket cleanly; dispose() reaps timers/listeners. The pty is
    // already gone, so kill() is a harmless no-op guarded by try/catch.
    this.dispose(1000, 'pty-exit');
  }

  /**
   * Pause the pty when the socket's send buffer is congested; poll and resume
   * once it drains. Prevents a `yes`-style flood from ballooning memory.
   */
  private applyBackpressure(): void {
    if (this.paused || this.disposed) return;
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
    if (this.disposed) return;
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
    if (msg.type === 'input') {
      try {
        this.pty.write(msg.data);
      } catch {
        /* pty may have exited; onExit will tear down */
      }
    } else {
      const cols = Math.min(MAX_COLS, Math.max(1, Math.floor(msg.cols)));
      const rows = Math.min(MAX_ROWS, Math.max(1, Math.floor(msg.rows)));
      try {
        this.pty.resize(cols, rows);
      } catch {
        /* ignore resize on a dead pty */
      }
    }
  }

  /** Parse + validate a client frame; returns null for anything malformed. */
  private parseMessage(raw: unknown): ClientMessage | null {
    let text: string;
    if (typeof raw === 'string') text = raw;
    else if (raw instanceof Buffer) text = raw.toString('utf8');
    else if (raw && typeof (raw as any).toString === 'function')
      text = String(raw);
    else return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const msg = parsed as Record<string, unknown>;

    if (msg.type === 'input' && typeof msg.data === 'string') {
      return { type: 'input', data: msg.data };
    }
    if (
      msg.type === 'resize' &&
      Number.isFinite(msg.cols) &&
      Number.isFinite(msg.rows)
    ) {
      return {
        type: 'resize',
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
  dispose(code = 1000, reason = 'closed'): void {
    if (this.disposed) return;
    this.disposed = true;

    this.clearDrainTimer();
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
      if (this.socket.readyState === WS_OPEN) this.socket.close(code, reason);
    } catch {
      /* noop */
    }
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  private safeSend(data: string): void {
    if (this.socket.readyState !== WS_OPEN) return;
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
