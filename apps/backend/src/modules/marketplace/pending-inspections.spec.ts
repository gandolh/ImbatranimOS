import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { AppManifest } from './app-manifest';
import {
  MAX_PENDING,
  PENDING_TTL_MS,
  PendingInspections,
} from './pending-inspections';

describe('PendingInspections (brief 158)', () => {
  let work: string;
  let pendings: PendingInspections;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'imb-pending-'));
    pendings = new PendingInspections();
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  const add = (name: string, now = 0) => {
    const dir = join(work, name);
    mkdirSync(dir);
    const release = pendings.reserve(now);
    const pending = pendings.add(
      {
        id: name.split('@')[0],
        buildId: name.split('@')[1],
        dir,
        root: '',
        entry: 'dist/a.mjs',
        manifest: {} as AppManifest,
        source: {
          url: 'https://github.com/o/r',
          repo: 'https://github.com/o/r',
          ref: null,
          commit: 'a'.repeat(40),
          subdir: null,
        },
      },
      now,
    );
    release();
    return { pending, dir };
  };

  it('holds a clone until it expires, then deletes it', async () => {
    const { pending, dir } = add('x-a@b1');
    expect(pendings.holds('x-a@b1')).toBe(true);
    expect(pendings.get(pending, PENDING_TTL_MS - 1)).not.toBeNull();
    await pendings.sweep(PENDING_TTL_MS);
    expect(pendings.get(pending, 0)).toBeNull();
    expect(existsSync(dir)).toBe(false);
    expect(pendings.holds('x-a@b1')).toBe(false);
  });

  it('deletes the clone on cancel, keeps it on take', async () => {
    const a = add('x-a@b1');
    const b = add('x-a@b2');
    await pendings.cancel(a.pending);
    expect(existsSync(a.dir)).toBe(false);
    pendings.take(b.pending);
    expect(pendings.get(b.pending)).toBeNull();
    expect(existsSync(b.dir)).toBe(true);
    // Unknown is not an error.
    await pendings.cancel('nope');
  });

  it('holds a directory while it is being cloned', () => {
    pendings.startCloning(join(work, 'x-a@b9'));
    expect(pendings.holds('x-a@b9')).toBe(true);
    pendings.stopCloning(join(work, 'x-a@b9'));
    expect(pendings.holds('x-a@b9')).toBe(false);
  });

  it(`refuses a check past ${MAX_PENDING}, running ones included`, async () => {
    for (let i = 0; i < MAX_PENDING - 1; i++) add(`x-a@b${i}`);
    const release = pendings.reserve(0);
    expect(() => pendings.reserve(0)).toThrow(/already waiting/);
    release();
    release(); // twice is harmless
    expect(() => pendings.reserve(0)).not.toThrow();
    // Expired ones free their slot.
    const later = PENDING_TTL_MS + 1;
    await pendings.sweep(later);
    expect(pendings.size).toBe(0);
  });
});
