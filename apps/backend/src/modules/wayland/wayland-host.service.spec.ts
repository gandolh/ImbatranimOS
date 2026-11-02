import { ConfigService } from '@nestjs/config';
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  WaylandHostService,
  type SessionListener,
} from './wayland-host.service';
import type { HostOutbound } from './wayland.protocol';

/**
 * A stand-in host, as a script: connects to the control socket it is given,
 * says hello, and answers a session_open with a toplevel and one frame.
 */
const FAKE_HOST = `#!/usr/bin/env node
const net = require('net');
const path = process.argv[process.argv.indexOf('--control') + 1];
const s = net.connect(path);
const json = (o) => { const b = Buffer.from(JSON.stringify(o)); const h = Buffer.alloc(5); h.writeUInt32LE(b.length + 1); h[4] = 1; s.write(Buffer.concat([h, b])); };
json({ type: 'hello', version: 1 });
let buf = Buffer.alloc(0);
s.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
    const n = buf.readUInt32LE(0); const m = JSON.parse(buf.subarray(5, 4 + n)); buf = buf.subarray(4 + n);
    if (m.type === 'session_open') {
      json({ type: 'session_ready', session: m.session, display: 'wayland-' + m.session });
      json({ type: 'toplevel_created', session: m.session, toplevel: 1, title: 't', app_id: 'a', width: m.width, height: m.height });
      const sid = Buffer.from(m.session); const body = Buffer.alloc(14); body.writeUInt32LE(1, 0);
      const p = Buffer.concat([Buffer.from([sid.length]), sid, body]); const h = Buffer.alloc(5); h.writeUInt32LE(p.length + 1); h[4] = 2;
      s.write(Buffer.concat([h, p]));
    }
    if (m.type === 'session_close') process.exit(0);
  }
});
`;

describe('WaylandHostService', () => {
  let dir: string;
  let oldRuntime: string | undefined;

  beforeEach(() => {
    // Short: a Unix socket's path has a length limit.
    dir = mkdtempSync(join(tmpdir(), 'wh-'));
    oldRuntime = process.env.XDG_RUNTIME_DIR;
    process.env.XDG_RUNTIME_DIR = dir;
  });

  afterEach(() => {
    if (oldRuntime === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = oldRuntime;
    rmSync(dir, { recursive: true, force: true });
  });

  const service = (bin: string) =>
    new WaylandHostService({
      get: (k: string) => (k === 'WAYLAND_HOST_BIN' ? bin : 'webp'),
    } as unknown as ConfigService<never, true>);

  function listener() {
    const messages: HostOutbound[] = [];
    const frames: Buffer[] = [];
    let goneReason: string | null = null;
    const l: SessionListener = {
      message: (m) => messages.push(m),
      frame: (b) => frames.push(b),
      gone: (r) => {
        goneReason = r;
      },
    };
    return { l, messages, frames, gone: () => goneReason };
  }

  const until = async (check: () => boolean) => {
    for (let i = 0; i < 200 && !check(); i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(check()).toBe(true);
  };

  it('starts the host, routes its messages and frames to the session, and stops it', async () => {
    const bin = join(dir, 'fake-host.js');
    writeFileSync(bin, FAKE_HOST);
    chmodSync(bin, 0o755);
    const svc = service(bin);
    const a = listener();
    const b = listener();
    expect(svc.open('sessionAAAAAAAAAAAA', 640, 480, a.l)).toBeNull();
    expect(svc.open('sessionBBBBBBBBBBBB', 800, 600, b.l)).toBeNull();
    await until(() => a.frames.length === 1 && b.frames.length === 1);
    expect(a.messages.map((m) => m.type)).toEqual([
      'session_ready',
      'toplevel_created',
    ]);
    expect(a.messages[1]).toMatchObject({ width: 640, height: 480 });
    expect(b.messages[1]).toMatchObject({ width: 800, height: 600 });
    // The control socket's directory is private to the user.
    expect(statSync(join(dir, 'imbatranim-wayland')).mode & 0o777).toBe(0o700);

    // The fake exits on the first close; every remaining session hears it.
    svc.close('sessionAAAAAAAAAAAA');
    await until(() => b.gone() !== null);
    expect(a.gone()).toBeNull();
    svc.onModuleDestroy();
  });

  it('reports a missing binary to the session instead of throwing', async () => {
    const svc = service(join(dir, 'no-such-host'));
    const a = listener();
    expect(svc.open('sessionAAAAAAAAAAAA', 640, 480, a.l)).toBeNull();
    await until(() => a.gone() !== null);
    expect(a.gone()).toMatch(/cannot start/);
  });

  it('is unavailable without XDG_RUNTIME_DIR', () => {
    delete process.env.XDG_RUNTIME_DIR;
    expect(
      service('x').open('sessionAAAAAAAAAAAA', 1, 1, listener().l),
    ).toMatch(/XDG_RUNTIME_DIR/);
  });
});
