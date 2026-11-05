import { connect, type Socket } from 'node:net';
import {
  decodeMessage,
  encodeMessage,
  messageLength,
  MessageType,
  NO_REPLY_EXPECTED,
  type Message,
} from './wire';

/**
 * A client connection to a D-Bus bus over a Unix socket: EXTERNAL auth as
 * this process's uid, `Hello`, method calls with replies, method calls in
 * (answered by a handler) and signals out. Enough to own a well-known name
 * and serve one object; not a general binding.
 */

export const BUS = {
  name: 'org.freedesktop.DBus',
  path: '/org/freedesktop/DBus',
  interface: 'org.freedesktop.DBus',
} as const;

/** What a method call handler answers: a reply, or an error by name. */
export type HandlerResult =
  | { signature?: string; body?: unknown[] }
  | { error: string; message: string };

export type MethodHandler = (call: Message) => HandlerResult | undefined;

export class DbusError extends Error {
  constructor(
    readonly name: string,
    message: string,
  ) {
    super(message);
  }
}

/** How long a call waits for its reply. */
const CALL_TIMEOUT_MS = 10_000;

export class DbusConnection {
  private socket: Socket | null = null;
  private serial = 0;
  private pending = new Map<
    number,
    {
      resolve: (m: Message) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private buffer: Buffer = Buffer.alloc(0);
  private handler: MethodHandler | null = null;
  private signalListeners: ((m: Message) => void)[] = [];
  private closeListeners: (() => void)[] = [];
  private closed = false;
  /** The bus's name for this connection, after `Hello`. */
  uniqueName = '';

  /**
   * Connect to a bus at a Unix socket path and say `Hello`. `uid` is the
   * one EXTERNAL authenticates as: this process's own.
   */
  static async open(path: string, uid: number): Promise<DbusConnection> {
    const c = new DbusConnection();
    await c.connectAndAuth(path, uid);
    const reply = await c.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: 'Hello',
    });
    c.uniqueName = typeof reply.body[0] === 'string' ? reply.body[0] : '';
    return c;
  }

  private connectAndAuth(path: string, uid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(path);
      this.socket = socket;
      let authed = false;
      let text = '';
      const fail = (e: Error) => {
        if (authed) return;
        socket.destroy();
        reject(e);
      };
      socket.once('error', fail);
      socket.on('connect', () => {
        const hexUid = Buffer.from(String(uid), 'ascii').toString('hex');
        socket.write(Buffer.from(`\0AUTH EXTERNAL ${hexUid}\r\n`, 'ascii'));
      });
      socket.on('data', (chunk: Buffer) => {
        if (authed) {
          this.onData(chunk);
          return;
        }
        text += chunk.toString('latin1');
        const line = text.indexOf('\r\n');
        if (line < 0) return;
        const reply = text.slice(0, line);
        if (!reply.startsWith('OK ')) {
          fail(new Error(`bus refused authentication: ${reply}`));
          return;
        }
        authed = true;
        socket.write('BEGIN\r\n');
        socket.off('error', fail);
        socket.on('error', () => this.shutdown());
        socket.on('close', () => this.shutdown());
        // Anything after the OK line is already binary.
        const rest = Buffer.from(text.slice(line + 2), 'latin1');
        if (rest.length) this.onData(rest);
        resolve();
      });
    });
  }

  /** Answer method calls addressed to this connection. */
  onMethodCall(handler: MethodHandler): void {
    this.handler = handler;
  }

  /** Hear signals this connection receives (after an AddMatch for them). */
  onSignal(listener: (m: Message) => void): void {
    this.signalListeners.push(listener);
  }

  onClose(listener: () => void): void {
    if (this.closed) listener();
    else this.closeListeners.push(listener);
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  private nextSerial(): number {
    this.serial = this.serial >= 0xffffffff ? 1 : this.serial + 1;
    return this.serial;
  }

  private send(m: Omit<Message, 'serial'>): number {
    const serial = this.nextSerial();
    if (!this.closed) this.socket?.write(encodeMessage({ ...m, serial }));
    return serial;
  }

  /** Call a method and wait for its reply; rejects with {@link DbusError}. */
  call(m: {
    destination: string;
    path: string;
    interface: string;
    member: string;
    signature?: string;
    body?: unknown[];
  }): Promise<Message> {
    if (this.closed) return Promise.reject(new Error('bus connection closed'));
    return new Promise((resolve, reject) => {
      const serial = this.send({
        type: MessageType.MethodCall,
        flags: 0,
        ...m,
        body: m.body ?? [],
      });
      const timer = setTimeout(() => {
        this.pending.delete(serial);
        reject(new Error(`${m.member}: no reply`));
      }, CALL_TIMEOUT_MS);
      timer.unref();
      this.pending.set(serial, { resolve, reject, timer });
    });
  }

  /** Emit a signal to whoever listens. */
  signal(m: {
    path: string;
    interface: string;
    member: string;
    signature?: string;
    body?: unknown[];
  }): void {
    this.send({
      type: MessageType.Signal,
      flags: NO_REPLY_EXPECTED,
      ...m,
      body: m.body ?? [],
    });
  }

  close(): void {
    this.socket?.destroy();
    this.shutdown();
  }

  private onData(chunk: Buffer): void {
    this.buffer = this.buffer.length
      ? Buffer.concat([this.buffer, chunk])
      : chunk;
    try {
      for (;;) {
        const length = messageLength(this.buffer);
        if (length === null || this.buffer.length < length) return;
        const message = decodeMessage(this.buffer.subarray(0, length));
        this.buffer = this.buffer.subarray(length);
        this.dispatch(message);
      }
    } catch {
      // A malformed message: the bus never sends one, so the stream is lost.
      this.close();
    }
  }

  private dispatch(m: Message): void {
    if (m.type === MessageType.MethodReturn || m.type === MessageType.Error) {
      const waiting =
        m.replySerial !== undefined
          ? this.pending.get(m.replySerial)
          : undefined;
      if (!waiting) return;
      this.pending.delete(m.replySerial!);
      clearTimeout(waiting.timer);
      if (m.type === MessageType.Error) {
        waiting.reject(
          new DbusError(
            m.errorName ?? 'org.freedesktop.DBus.Error.Failed',
            typeof m.body[0] === 'string' ? m.body[0] : '',
          ),
        );
      } else {
        waiting.resolve(m);
      }
      return;
    }
    if (m.type === MessageType.Signal) {
      for (const l of this.signalListeners) l(m);
      return;
    }
    if (m.type !== MessageType.MethodCall) return;
    let result: HandlerResult | undefined;
    try {
      result = this.handler?.(m);
    } catch (e) {
      result = {
        error: 'org.freedesktop.DBus.Error.Failed',
        message: (e as Error).message,
      };
    }
    result ??= {
      error: 'org.freedesktop.DBus.Error.UnknownMethod',
      message: `No such method ${m.interface ?? ''}.${m.member ?? ''}`,
    };
    if (m.flags & NO_REPLY_EXPECTED) return;
    if ('error' in result) {
      this.send({
        type: MessageType.Error,
        flags: NO_REPLY_EXPECTED,
        errorName: result.error,
        replySerial: m.serial,
        destination: m.sender,
        signature: 's',
        body: [result.message],
      });
    } else {
      this.send({
        type: MessageType.MethodReturn,
        flags: NO_REPLY_EXPECTED,
        replySerial: m.serial,
        destination: m.sender,
        signature: result.signature,
        body: result.body ?? [],
      });
    }
  }

  private shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('bus connection closed'));
    }
    this.pending.clear();
    for (const l of this.closeListeners) l();
    this.closeListeners = [];
  }
}
