import type { ChildProcess } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { brotliCompressSync } from 'zlib';
import type { WaylandGateway } from '../wayland/wayland.gateway';
import { LinuxAppsService, parseProfileList } from './linux-apps.service';

// Every spawn the service makes goes through this; nothing really runs.
const mockSpawn = jest.fn<ChildProcess, unknown[]>();
jest.mock('child_process', (): typeof import('child_process') => ({
  ...jest.requireActual<typeof import('child_process')>('child_process'),
  spawn: ((...args: unknown[]) => mockSpawn(...args)) as never,
}));

const SESSION = 'abcdefghijklmnop';
const COMMIT = 'c'.repeat(40);

function machine() {
  const root = mkdtempSync(join(tmpdir(), 'linux-apps-'));
  const indexDir = join(root, 'index');
  const store = join(root, 'store');
  const profile = join(root, 'state', 'profile');
  mkdirSync(indexDir, { recursive: true });
  mkdirSync(join(store, 'aaa-firefox-159.0', 'share', 'applications'), {
    recursive: true,
  });
  mkdirSync(
    join(
      store,
      'aaa-firefox-159.0',
      'share',
      'icons',
      'hicolor',
      '128x128',
      'apps',
    ),
    { recursive: true },
  );
  mkdirSync(join(root, 'state'), { recursive: true });
  symlinkSync(join(store, 'aaa-firefox-159.0'), profile);
  writeFileSync(join(indexDir, 'git-revision'), COMMIT + '\n');
  writeFileSync(
    join(root, 'pin.env'),
    `NIXPKGS_RELEASE=nixos-26.05\nNIXPKGS_COMMIT=${COMMIT}\n`,
  );
  const packages = {
    firefox: {
      meta: { description: 'Web browser', license: { free: true } },
      pname: 'firefox',
      system: 'x86_64-linux',
      version: '159.0',
    },
  };
  writeFileSync(
    join(indexDir, 'packages.json.br'),
    brotliCompressSync(Buffer.from(JSON.stringify({ packages, version: 2 }))),
  );
  const apps = join(store, 'aaa-firefox-159.0', 'share', 'applications');
  writeFileSync(
    join(apps, 'firefox.desktop'),
    '[Desktop Entry]\nType=Application\nName=Firefox\nIcon=firefox\nExec=firefox --name firefox %U\n',
  );
  writeFileSync(
    join(apps, 'hidden.desktop'),
    '[Desktop Entry]\nType=Application\nName=Hidden\nExec=x\nNoDisplay=true\n',
  );
  writeFileSync(
    join(
      store,
      'aaa-firefox-159.0',
      'share',
      'icons',
      'hicolor',
      '128x128',
      'apps',
      'firefox.png',
    ),
    'png',
  );
  return {
    root,
    paths: {
      indexDir,
      pinFile: join(root, 'pin.env'),
      profile,
      cacheDir: join(root, 'cache'),
      store,
    },
  };
}

describe('LinuxAppsService', () => {
  let m: ReturnType<typeof machine>;
  let live: Set<string>;
  let apps: LinuxAppsService;

  beforeEach(() => {
    m = machine();
    live = new Set([SESSION]);
    apps = new LinuxAppsService({
      hasSession: (id: string) => live.has(id),
    } as unknown as WaylandGateway);
    apps.paths = m.paths;
  });
  afterEach(() => {
    apps.onModuleDestroy();
    rmSync(m.root, { recursive: true, force: true });
    mockSpawn.mockReset();
  });

  it('builds the index once and searches it', async () => {
    expect((await apps.status()).index).toMatch(/building|ready/);
    expect(await apps.search('firefox')).toEqual([
      {
        attr: 'firefox',
        pname: 'firefox',
        version: '159.0',
        description: 'Web browser',
        unfree: false,
      },
    ]);
    expect((await apps.status()).index).toBe('ready');
  });

  it('says so, and installs nothing, when the index is not from the pinned commit', async () => {
    writeFileSync(m.paths.pinFile, `NIXPKGS_COMMIT=${'d'.repeat(40)}\n`);
    expect((await apps.status()).index).toBe('mismatch');
    await expect(apps.install('firefox', SESSION)).rejects.toThrow(/pin/);
  });

  it('refuses a made-up package without running anything', async () => {
    const spawn = mockSpawn;
    await expect(apps.install('no-such-package-xyz', SESSION)).rejects.toThrow(
      /no package no-such-package-xyz/,
    );
    await expect(apps.install('firefox; rm -rf ~', SESSION)).rejects.toThrow(
      /not a package name/,
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(apps.getJob()).toBeNull();
  });

  it('changes nothing for a tab whose session is not live', async () => {
    const spawn = mockSpawn;
    await expect(apps.install('firefox', 'zzzzzzzzzzzzzzzz')).rejects.toThrow(
      /session/,
    );
    expect(() => apps.freeSpace('not a session')).toThrow(/session/);
    await expect(apps.launch('firefox', 'zzzzzzzzzzzzzzzz')).rejects.toThrow(
      /session/,
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('lists Start entries from the profile, with their icons', async () => {
    expect(await apps.launchers()).toEqual([
      { id: 'firefox', name: 'Firefox', comment: '', hasIcon: true },
    ]);
    expect((await apps.icon('firefox')).type).toBe('image/png');
    await expect(apps.icon('../../etc/passwd')).rejects.toThrow(/No icon/);
  });

  it("starts a launcher's Exec, field codes removed, in its own group, for the session", async () => {
    const fake = {
      pid: 4242,
      once: jest.fn((ev: string, cb: () => void) => ev === 'spawn' && cb()),
      unref: jest.fn(),
    };
    mockSpawn.mockReturnValue(fake as never);
    const spawn = mockSpawn;
    await expect(apps.launch('firefox', SESSION)).resolves.toEqual({
      pid: 4242,
    });
    const [cmd, args, opts] = spawn.mock.calls[0] as [string, string[], object];
    expect(cmd).toBe('firefox');
    expect(args).toEqual(['--name', 'firefox']);
    expect(opts).toMatchObject({ detached: true });
    expect((opts as { env: NodeJS.ProcessEnv }).env.WAYLAND_DISPLAY).toBe(
      `wayland-${SESSION}`,
    );
    expect(apps.launchedGroups(SESSION)).toEqual([4242]);
  });
});

describe("reading the profile's list", () => {
  it('takes each element with its attribute and version', () => {
    const json = JSON.stringify({
      elements: {
        firefox: {
          attrPath: 'legacyPackages.x86_64-linux.firefox',
          storePaths: ['/nix/store/abc-firefox-159.0'],
        },
        'CuboCore.corefm': {
          attrPath: 'legacyPackages.x86_64-linux.CuboCore.corefm',
          storePaths: ['/nix/store/def-corefm-5.0.0'],
        },
      },
      version: 3,
    });
    expect(parseProfileList(json)).toEqual([
      { name: 'CuboCore.corefm', attr: 'CuboCore.corefm', version: '5.0.0' },
      { name: 'firefox', attr: 'firefox', version: '159.0' },
    ]);
    expect(parseProfileList('not json')).toEqual([]);
  });
});
