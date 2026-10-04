import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { DbService } from '../../db/db.service';
import {
  BrowserProfileService,
  browserProfileKeyPath,
} from './browser-profile.service';

const JAR = JSON.stringify({
  'session@.example.com@/': { name: 'session', value: 'very-secret-value' },
});

function dbAt(path: string): DbService {
  const config = {
    get: (key: string) => (key === 'DB_PATH' ? path : undefined),
  };
  const dbs = new DbService(config as never);
  dbs.onModuleInit();
  return dbs;
}

describe('BrowserProfileService (brief 50)', () => {
  let dir: string;
  let dbs: DbService;
  let profile: BrowserProfileService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imb-browser-'));
    dbs = dbAt(join(dir, 'db.sqlite'));
    profile = new BrowserProfileService(dbs);
  });
  afterEach(() => {
    dbs.onModuleDestroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads empty before anything was saved', () => {
    expect(profile.read()).toEqual({ jar: null, updatedAt: null });
  });

  it('round-trips the jar', () => {
    profile.write(JAR, 1234);
    expect(profile.read()).toEqual({ jar: JAR, updatedAt: 1234 });
  });

  it('stores ciphertext only, never the cookie values', () => {
    profile.write(JAR);
    const row = dbs.db
      .prepare('SELECT blob FROM browser_profile WHERE id = 1')
      .get() as { blob: Buffer };
    expect(row.blob.includes(Buffer.from('very-secret-value'))).toBe(false);
    expect(row.blob.includes(Buffer.from('session'))).toBe(false);
  });

  it('keeps the key in its own 0600 file beside the database', () => {
    profile.write(JAR);
    const key = statSync(browserProfileKeyPath(dbs.path()));
    expect(key.size).toBe(32);
    expect(key.mode & 0o777).toBe(0o600);
  });

  it('reads a tampered jar as empty rather than garbage', () => {
    profile.write(JAR);
    dbs.db
      .prepare(
        "UPDATE browser_profile SET blob = substr(blob, 1, length(blob) - 1) || x'00'",
      )
      .run();
    expect(profile.read().jar).toBeNull();
  });

  it('reads as empty when the key is gone (a restore from another machine)', () => {
    profile.write(JAR);
    rmSync(browserProfileKeyPath(dbs.path()));
    expect(new BrowserProfileService(dbs).read().jar).toBeNull();
  });

  it('refuses a jar that is not a JSON object', () => {
    for (const bad of ['not json', '[]', 'null', '"x"']) {
      expect(() => profile.write(bad)).toThrow(BadRequestException);
    }
  });

  it('clears', () => {
    profile.write(JAR);
    profile.clear();
    expect(profile.read().jar).toBeNull();
  });
});
