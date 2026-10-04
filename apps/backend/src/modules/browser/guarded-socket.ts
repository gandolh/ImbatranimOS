import { Logger } from '@nestjs/common';
import { Socket } from 'net';

import { resolvePublicTarget } from './egress';

/** A destination that has not answered by now is given up on. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Chunks held for the page before the remote side is paused. */
const HIGH_WATER = 128;

const logger = new Logger('BrowserRelay');

/**
 * The TCP socket the Wisp relay opens for each stream, with the egress rule
 * built in (brief 50).
 *
 * wisp-js accepts a socket class of its own shape, and this is the one place a
 * connection is made, so the rule cannot be skipped by any path through the
 * library: `connect()` resolves the destination through
 * {@link resolvePublicTarget} and dials the address that was checked, never
 * the hostname. wisp-js's own filter also runs first, but it checks only the
 * first DNS answer, lets `::ffff:127.0.0.1` through and re-resolves before
 * connecting, so it is not relied on.
 */
export class GuardedTcpSocket {
  private socket: Socket | null = null;
  private readonly queue: Buffer[] = [];
  private waiter: ((chunk: Buffer | null) => void) | null = null;
  private ended = false;
  private paused = false;

  constructor(
    readonly hostname: string,
    readonly port: number,
  ) {}

  async connect(): Promise<void> {
    let target: Awaited<ReturnType<typeof resolvePublicTarget>>;
    try {
      target = await resolvePublicTarget(this.hostname, this.port);
    } catch (err) {
      logger.warn(
        `Refused a stream to ${this.hostname}:${this.port}: ${(err as Error).message}`,
      );
      throw err;
    }
    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      this.socket = socket;
      socket.setNoDelay(true);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('connect timed out'));
      }, CONNECT_TIMEOUT_MS);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('data', (chunk: Buffer) => this.push(chunk));
      // 'close' always follows 'error'; the handler only keeps an unhandled
      // error from taking the process down.
      socket.on('error', () => undefined);
      socket.on('close', () => {
        clearTimeout(timer);
        this.finish();
        // A no-op once connected.
        reject(new Error('closed before connecting'));
      });
      socket.connect({
        host: target.address,
        port: this.port,
        family: target.family,
      });
    });
  }

  private push(chunk: Buffer): void {
    if (this.waiter) {
      const wake = this.waiter;
      this.waiter = null;
      wake(chunk);
      return;
    }
    this.queue.push(chunk);
    // Pause here too, not only when wisp-js calls pause(): it calls that after
    // each recv, so a page that stops reading would otherwise grow the queue
    // without bound.
    if (this.queue.length >= HIGH_WATER && this.socket && !this.paused) {
      this.socket.pause();
      this.paused = true;
    }
  }

  private finish(): void {
    this.ended = true;
    this.socket = null;
    if (this.waiter) {
      const wake = this.waiter;
      this.waiter = null;
      wake(null);
    }
  }

  /** The next chunk from the destination, or null once it has closed. */
  recv(): Promise<Buffer | null> {
    const next = this.queue.shift();
    if (next) {
      if (this.paused && this.queue.length < HIGH_WATER / 2) this.resume();
      return Promise.resolve(next);
    }
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  send(data: Uint8Array): Promise<void> {
    const socket = this.socket;
    if (!socket) return Promise.resolve();
    return new Promise((resolve) => {
      socket.write(data, () => resolve());
    });
  }

  close(): Promise<void> {
    this.socket?.destroy();
    this.finish();
    return Promise.resolve();
  }

  /** Called by wisp-js after each chunk; stops reading while the page is behind. */
  pause(): void {
    if (this.socket && this.queue.length >= HIGH_WATER) {
      this.socket.pause();
      this.paused = true;
    }
  }

  resume(): void {
    if (this.socket && this.paused) {
      this.socket.resume();
      this.paused = false;
    }
  }
}

/** UDP is off for the relay; this refuses even if wisp-js asks anyway. */
export class RefusedUdpSocket {
  constructor(
    readonly hostname: string,
    readonly port: number,
  ) {}
  connect(): Promise<void> {
    return Promise.reject(new Error('UDP streams are not allowed'));
  }
  recv(): Promise<null> {
    return Promise.resolve(null);
  }
  send(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
  resume(): void {}
}
