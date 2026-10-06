import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { request } from 'http';
import { createServer } from 'net';

import { LOG_TAIL_BYTES } from './run-step';

/** The ports app servers are given, on 127.0.0.1. Never published by the image. */
export const PORT_FIRST = 41000;
export const PORT_LAST = 41999;
/** The most app servers running at once. */
export const MAX_SERVERS = 4;
/** How long a server has to answer its health path after starting. */
const HEALTH_TIMEOUT_MS = 30_000;
/** A window's claim on its server lapses unless renewed within this. */
export const LEASE_MS = 2 * 60_000;
/** How often unclaimed servers are stopped. */
const SWEEP_MS = 15_000;
/** SIGTERM, then this long, then SIGKILL. */
const STOP_GRACE_MS = 5_000;
/** This many crashes inside the window and the supervisor stops restarting. */
const MAX_CRASHES = 5;
const CRASH_WINDOW_MS = 2 * 60_000;
/** The heap a server may grow to. A game's sim server, not a database. */
const MAX_OLD_SPACE_MB = 1024;

export interface ServerSpec {
  command: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  health: string;
  portEnv: string;
}

export type ServerStatus =
  | { state: 'stopped' }
  | { state: 'starting' | 'up'; port: number }
  | { state: 'crashed'; reason: string };

interface Running {
  id: string;
  spec: ServerSpec;
  port: number;
  child: ChildProcess | null;
  state: 'starting' | 'up' | 'crashed';
  reason?: string;
  ready: Promise<void>;
  /** Lease id → expiry. One per open window of the app. */
  leases: Map<string, number>;
  /** Proxied WebSockets open now. */
  sockets: number;
  crashes: number[];
  output: Buffer;
  stopping: boolean;
  restartTimer: NodeJS.Timeout | null;
}

/**
 * Runs the servers of service apps (brief 120): Farm Valley's and Citadel's
 * simulation servers.
 *
 * This is the "no supervisor daemon" kill-list item, extended and fenced: it
 * supervises marketplace apps' servers and nothing else. A server runs while
 * something wants it — an open window holding a lease, or a proxied socket —
 * and is stopped when nothing has for a sweep. It restarts after a crash with
 * a growing delay, and gives up after {@link MAX_CRASHES} crashes in
 * {@link CRASH_WINDOW_MS}, so a broken build does not spin.
 *
 * It listens on 127.0.0.1 at a port from a fixed range, passed in the
 * descriptor's `portEnv`. Nothing outside the backend reaches it: the image
 * publishes no such port, and the desktop talks to it through the
 * session-checked proxy.
 */
@Injectable()
export class MarketplaceServers implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceServers.name);
  private readonly running = new Map<string, Running>();
  private sweepTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
    this.sweepTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)));
  }

  status(id: string): ServerStatus {
    const r = this.running.get(id);
    if (!r) return { state: 'stopped' };
    if (r.state === 'crashed') {
      return { state: 'crashed', reason: r.reason ?? 'crashed' };
    }
    return { state: r.state, port: r.port };
  }

  /** The port of a server that is up, for the proxy. */
  portFor(id: string): number | null {
    const r = this.running.get(id);
    return r && r.state === 'up' ? r.port : null;
  }

  output(id: string): string {
    return this.running.get(id)?.output.toString('utf8') ?? '';
  }

  /**
   * Claim the app's server for a window: start it if it is not running and
   * wait until it answers. Renewing passes the lease back.
   */
  async acquire(
    id: string,
    spec: () => ServerSpec,
    lease?: string,
  ): Promise<{ lease: string }> {
    let r = this.running.get(id);
    if (r?.state === 'crashed') {
      // Asked for again after giving up: one more honest try.
      this.running.delete(id);
      r = undefined;
    }
    if (!r) {
      // One that crashed for good holds no process, so no slot.
      const live = [...this.running.values()].filter(
        (x) => x.state !== 'crashed',
      );
      if (live.length >= MAX_SERVERS) {
        throw new ServiceUnavailableException(
          `${MAX_SERVERS} app servers are running already; close one of those apps first`,
        );
      }
      r = await this.start(id, spec());
    }
    const id_ = lease && r.leases.has(lease) ? lease : randomUUID();
    r.leases.set(id_, Date.now() + LEASE_MS);
    try {
      await r.ready;
    } catch (err) {
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'The app server did not start',
      );
    }
    return { lease: id_ };
  }

  release(id: string, lease: string): void {
    this.running.get(id)?.leases.delete(lease);
  }

  socketOpened(id: string): void {
    const r = this.running.get(id);
    if (r) r.sockets += 1;
  }

  socketClosed(id: string): void {
    const r = this.running.get(id);
    if (r) r.sockets = Math.max(0, r.sockets - 1);
  }

  async stop(id: string): Promise<void> {
    const r = this.running.get(id);
    if (!r) return;
    this.running.delete(id);
    r.stopping = true;
    if (r.restartTimer) clearTimeout(r.restartTimer);
    await killGroup(r.child);
  }

  /** Stop every server nothing wants any more. */
  sweep(now = Date.now()): void {
    for (const r of [...this.running.values()]) {
      for (const [lease, expiry] of r.leases) {
        if (expiry <= now) r.leases.delete(lease);
      }
      if (r.state === 'crashed') continue;
      if (r.leases.size === 0 && r.sockets === 0) {
        this.logger.log(`Stopping ${r.id}'s server: no window holds it`);
        void this.stop(r.id);
      }
    }
  }

  // ── processes ────────────────────────────────────────────────────────────

  private async start(id: string, spec: ServerSpec): Promise<Running> {
    const port = await this.freePort();
    const r: Running = {
      id,
      spec,
      port,
      child: null,
      state: 'starting',
      ready: Promise.resolve(),
      leases: new Map(),
      sockets: 0,
      crashes: [],
      output: Buffer.alloc(0),
      stopping: false,
      restartTimer: null,
    };
    this.running.set(id, r);
    this.spawn(r);
    return r;
  }

  private spawn(r: Running): void {
    r.state = 'starting';
    const env: NodeJS.ProcessEnv = {
      ...r.spec.env,
      [r.spec.portEnv]: String(r.port),
      HOST: '127.0.0.1',
      NODE_OPTIONS: `--max-old-space-size=${MAX_OLD_SPACE_MB}`,
    };
    let child: ChildProcess;
    try {
      child = spawn(r.spec.command[0], r.spec.command.slice(1), {
        cwd: r.spec.cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      r.state = 'crashed';
      r.reason = (err as Error).message;
      r.ready = Promise.reject(new Error(r.reason));
      r.ready.catch(() => undefined);
      return;
    }
    r.child = child;
    const keep = (chunk: Buffer) => {
      r.output = Buffer.concat([r.output, chunk]);
      if (r.output.length > LOG_TAIL_BYTES) {
        r.output = r.output.subarray(r.output.length - LOG_TAIL_BYTES);
      }
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);

    let exited = false;
    const exit = new Promise<string>((resolve) => {
      child.on('error', (err) => {
        exited = true;
        resolve(err.message);
      });
      child.on('exit', (code, signal) => {
        exited = true;
        resolve(`exited with ${code ?? signal}`);
      });
    });

    r.ready = (async () => {
      const deadline = Date.now() + HEALTH_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (exited || r.stopping) break;
        if (await answers(r.port, r.spec.health)) {
          r.state = 'up';
          return;
        }
        await new Promise((res) => setTimeout(res, 250));
      }
      if (!exited && !r.stopping) {
        void killGroup(child);
        throw new Error(
          `The server did not answer ${r.spec.health} within ${HEALTH_TIMEOUT_MS / 1000} s`,
        );
      }
      throw new Error(`The server ${await exit} before it was ready`);
    })();
    r.ready.catch(() => undefined);

    void exit.then((why) => {
      // The process group goes with it: whatever the server started.
      void killGroup(child);
      if (r.stopping || this.running.get(r.id) !== r) return;
      const now = Date.now();
      r.crashes = [...r.crashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
      this.logger.warn(`${r.id}'s server ${why}`);
      if (r.crashes.length >= MAX_CRASHES) {
        r.state = 'crashed';
        r.reason = `It crashed ${MAX_CRASHES} times in ${CRASH_WINDOW_MS / 60_000} minutes (last: ${why}); not restarting it`;
        return;
      }
      const delay = Math.min(30_000, 1000 * 2 ** (r.crashes.length - 1));
      r.state = 'starting';
      r.restartTimer = setTimeout(() => {
        r.restartTimer = null;
        if (!r.stopping && this.running.get(r.id) === r) this.spawn(r);
      }, delay);
    });
  }

  private async freePort(): Promise<number> {
    const taken = new Set([...this.running.values()].map((r) => r.port));
    // Start somewhere other than the first port each time, so a port a
    // just-stopped server has not quite let go of is not the next one tried.
    const span = PORT_LAST - PORT_FIRST + 1;
    const offset = Math.floor(Math.random() * span);
    for (let i = 0; i < span; i += 1) {
      const port = PORT_FIRST + ((offset + i) % span);
      if (taken.has(port)) continue;
      if (await isFree(port)) return port;
    }
    throw new ServiceUnavailableException('No free port for the app server');
  }
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/** Any HTTP answer below 500 counts: the server is listening and sane. */
function answers(port: number, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', timeout: 2000 },
      (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end();
  });
}

/** SIGTERM the process group, SIGKILL it after {@link STOP_GRACE_MS}. */
async function killGroup(child: ChildProcess | null): Promise<void> {
  const pid = child?.pid;
  if (!pid) return;
  const signal = (s: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, s);
      return true;
    } catch {
      return false;
    }
  };
  if (!signal('SIGTERM')) return;
  const deadline = Date.now() + STOP_GRACE_MS;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 100));
    // Signal 0: is anyone in the group left?
    if (!signal(0)) return;
  }
  signal('SIGKILL');
}
