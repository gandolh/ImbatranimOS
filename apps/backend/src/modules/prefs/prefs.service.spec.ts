import { BadRequestException } from '@nestjs/common';
import { PrefsService } from './prefs.service';
import { DbService } from '../../db/db.service';
import { makeTestDb } from '../auth/test-utils';

describe('PrefsService', () => {
  let db: DbService;
  let service: PrefsService;

  beforeEach(() => {
    db = makeTestDb();
    service = new PrefsService(db);
    service.onModuleInit();
  });

  it('returns an empty object when nothing is stored', () => {
    expect(service.findAll()).toEqual({});
  });

  it('round-trips arbitrary JSON value types (object, string, number, bool, null)', () => {
    service.upsertMany({
      appearance: { theme: 'dark', accent: '#7c3aed' },
      wallpaper: 'nebula.png',
      fontSize: 14,
      soundsEnabled: true,
      lastError: null,
    });

    expect(service.findAll()).toEqual({
      appearance: { theme: 'dark', accent: '#7c3aed' },
      wallpaper: 'nebula.png',
      fontSize: 14,
      soundsEnabled: true,
      lastError: null,
    });
  });

  it('bulk upsert overwrites existing keys and adds new ones alongside untouched keys', () => {
    service.upsertMany({
      appearance: { theme: 'dark' },
      wallpaper: { path: 'a.png' },
    });

    service.upsertMany({
      appearance: { theme: 'light' }, // overwrite
      dock: { pinned: ['files', 'terminal'] }, // new
    });

    expect(service.findAll()).toEqual({
      appearance: { theme: 'light' },
      wallpaper: { path: 'a.png' },
      dock: { pinned: ['files', 'terminal'] },
    });
  });

  it('persists the latest write across separate reads (no stale caching)', () => {
    service.upsertMany({ counter: 1 });
    expect(service.findAll().counter).toBe(1);
    service.upsertMany({ counter: 2 });
    expect(service.findAll().counter).toBe(2);
  });

  it('rejects a body that is not a plain object', () => {
    const cases: unknown[] = ['nope', 42, true, null, [1, 2, 3]];
    for (const bad of cases) {
      expect(() => service.upsertMany(bad as Record<string, unknown>)).toThrow(
        BadRequestException,
      );
    }
  });

  it('removes a single key without touching others', () => {
    service.upsertMany({ a: 1, b: 2 });
    service.remove('a');
    expect(service.findAll()).toEqual({ b: 2 });
  });

  it('remove is idempotent for a key that does not exist', () => {
    expect(() => service.remove('does-not-exist')).not.toThrow();
    expect(service.findAll()).toEqual({});
  });

  it('skips a corrupt row instead of failing the whole read', () => {
    service.upsertMany({ good: 1, alsoGood: 'fine' });
    // Bypass upsertMany (which always JSON.stringifies) to simulate a row
    // that somehow ended up with non-JSON text in its value column.
    db.db
      .prepare(
        'INSERT INTO prefs (key, value, updated_at) VALUES (@key, @value, @updated_at)',
      )
      .run({ key: 'corrupt', value: 'not-json{{', updated_at: Date.now() });

    expect(service.findAll()).toEqual({ good: 1, alsoGood: 'fine' });
  });
});
