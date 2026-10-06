import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { request } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  MarketplaceServers,
  type ServerSpec,
} from './marketplace-servers.service';

function get(port: number, path: string): Promise<number> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

describe('MarketplaceServers (brief 120)', () => {
  let dir: string;
  let servers: MarketplaceServers;

  const spec = (script: string): (() => ServerSpec) => {
    const file = join(dir, `s${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(file, script);
    return () => ({
      command: ['node', file],
      cwd: dir,
      env: { PATH: process.env.PATH },
      health: '/health',
      portEnv: 'APP_PORT',
    });
  };

  const httpServer = `import { createServer } from 'http';
createServer((req, res) => res.end(req.url === '/health' ? 'ok' : String(process.env.HOST)))
  .listen(Number(process.env.APP_PORT), process.env.HOST);`;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imb-servers-'));
    servers = new MarketplaceServers();
  });
  afterEach(async () => {
    await servers.onModuleDestroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts a server on a loopback port from the range and waits for its health', async () => {
    const { lease } = await servers.acquire('game', spec(httpServer));
    expect(lease).toMatch(/^[0-9a-f-]{36}$/);
    const port = servers.portFor('game')!;
    expect(port).toBeGreaterThanOrEqual(41000);
    expect(port).toBeLessThanOrEqual(41999);
    expect(await get(port, '/health')).toBe(200);
    expect(servers.status('game')).toEqual({ state: 'up', port });
  });

  it('shares one server between leases and stops it when none is left', async () => {
    const s = spec(httpServer);
    const a = await servers.acquire('game', s);
    const b = await servers.acquire('game', s);
    const port = servers.portFor('game')!;
    servers.release('game', a.lease);
    servers.sweep();
    expect(servers.portFor('game')).toBe(port);
    servers.release('game', b.lease);
    servers.sweep();
    expect(servers.portFor('game')).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(await get(port, '/health')).toBe(0);
  });

  it('lets a lease lapse when it is not renewed', async () => {
    await servers.acquire('game', spec(httpServer));
    servers.sweep(Date.now() + 10 * 60_000);
    expect(servers.status('game')).toEqual({ state: 'stopped' });
  });

  it('keeps a server with an open socket even without a lease', async () => {
    const { lease } = await servers.acquire('game', spec(httpServer));
    servers.socketOpened('game');
    servers.release('game', lease);
    servers.sweep();
    expect(servers.portFor('game')).not.toBeNull();
    servers.socketClosed('game');
    servers.sweep();
    expect(servers.portFor('game')).toBeNull();
  });

  it('fails the lease cleanly when the server dies before it is ready', async () => {
    await expect(
      servers.acquire('game', spec('console.error("boom"); process.exit(2)')),
    ).rejects.toThrow(/exited with 2 before it was ready/);
    expect(servers.output('game')).toContain('boom');
  });

  it('restarts a crashed server', async () => {
    const marker = join(dir, 'crashed-once');
    await servers.acquire(
      'game',
      spec(`import { existsSync, writeFileSync } from 'fs';
${httpServer}
if (!existsSync(${JSON.stringify(marker)})) {
  writeFileSync(${JSON.stringify(marker)}, '');
  setTimeout(() => process.exit(1), 300);
}`),
    );
    await new Promise((r) => setTimeout(r, 2_500));
    const port = servers.portFor('game');
    expect(port).not.toBeNull();
    expect(await get(port!, '/health')).toBe(200);
  }, 10_000);
});
